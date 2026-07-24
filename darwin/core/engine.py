"""EvolutionEngine - the generational loop. LANE A owns this file (the sacred path).

    init -> evaluate -> select -> mutate -> repeat

Invariants that MUST hold:
  * Elitism: the top ELITE_K evaluated genomes carry forward unchanged, so best_fitness is
    monotonic and the on-stage curve never drops.
  * Never raise out of run() during a demo: a failed or screened-out variant scores 0 / is
    marked unfit and the loop continues.
"""

from __future__ import annotations

import concurrent.futures as cf
import time

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.core.population import Generation, RunRecord, Variant, rank, select
from darwin.sandbox.runner import run_agent_in_sandbox


class EvolutionEngine:
    """Drives evolution and streams events to the dashboard after every step."""

    def __init__(self, config: Config, *, fitness, sandboxes, mutator, guards, events=None):
        self.config = config
        self.fitness = fitness
        self.sandboxes = sandboxes
        self.mutator = mutator
        self.guards = guards
        self.events = events
        self._sandboxes_used = 0

    def _emit(self, kind: str, payload: dict) -> None:
        if self.events is not None:
            self.events.emit(kind, payload)

    # ------------------------------------------------------------------ #

    def run(self, task) -> RunRecord:  # noqa: ANN001
        started = time.time()
        run_id = f"run-{self.config.random_seed}-{int(started)}"

        population = [
            Genome.seed(task, genome_id=f"g0-{i}") for i in range(self.config.population_size)
        ]
        # THE MODEL RACE: when the mutator carries a live catalog, round-robin gen-0 across it
        # so every model starts a lineage. Offline (empty catalog) all seeds keep DEFAULT_MODEL
        # and the deterministic climb is untouched.
        race_models = getattr(self.mutator, "race_models", None) or []
        for i, genome in enumerate(population):
            if race_models:
                genome.model = race_models[i % len(race_models)]
                genome.lineage_note = f"seed (racing {genome.model.rsplit('/', 1)[-1]})"

        record = RunRecord(
            run_id=run_id,
            task_id=task.task_id,
            seed=self.config.random_seed,
            config={
                "population_size": self.config.population_size,
                "generations": self.config.generations,
                "elite_k": self.config.elite_k,
                "real_isolation": getattr(self.sandboxes, "is_real_isolation", False),
            },
        )
        self._emit("run_started", {"run_id": run_id, "task": task.task_id, "total_cases": task.total_cases})

        best_fitness = 0.0
        champion: Variant | None = None
        parent_fitness: dict[str, float] = {}
        gen0_outputs = None

        for gen_index in range(self.config.generations):
            self._emit("generation_started", {"index": gen_index, "size": len(population)})
            gen_start = time.time()

            variants = self._evaluate_population(population, task, gen_index)
            if gen_index == 0 and variants:
                gen0_outputs = variants[0].raw_outputs

            # Pillar 3: reject regressions vs parent, roll back their sandboxes
            variants = self.guards.filter(variants, parent_fitness)

            elite = select(variants, self.config.elite_k)
            gen_best = elite[0] if elite else champion

            # Elitism: never let the champion regress. Carry the prior champion if this gen is worse.
            if champion is not None and (gen_best is None or gen_best.fitness < champion.fitness):
                elite = [champion, *[e for e in elite if e.genome.genome_id != champion.genome_id]]
                elite = elite[: max(1, self.config.elite_k)]
                gen_best = champion

            if gen_best is not None and gen_best.fitness >= best_fitness:
                if champion is None or gen_best.genome.genome_id != champion.genome.genome_id:
                    # Pillar 4: gate promotion of a NEW champion
                    if self.guards.promote(gen_best.genome):
                        champion = gen_best
                        self._emit("champion_changed", {
                            "genome_id": champion.genome.genome_id,
                            "fitness": champion.fitness,
                            "generation": gen_index,
                        })
                best_fitness = max(best_fitness, gen_best.fitness)

            gen = Generation(
                index=gen_index,
                variants=variants,
                best_fitness=best_fitness,
                champion_id=champion.genome.genome_id if champion else "",
                started_at=gen_start,
                ended_at=time.time(),
            )
            record.generations.append(gen)
            record.fitness_curve.append(round(best_fitness, 4))
            self._emit("generation_complete", {
                "index": gen_index,
                "best_fitness": round(best_fitness, 4),
                "leaderboard": [
                    {
                        "genome_id": v.genome.genome_id,
                        "model": v.genome.model,
                        "fitness": round(v.fitness, 4),
                        "cost_est": v.cost_est,
                        "p50_latency_ms": v.p50_latency_ms,
                        "status": v.status,
                    }
                    for v in rank(variants)
                ],
            })

            # record parent fitness for next-gen regression checks
            parent_fitness = {v.genome.genome_id: v.fitness for v in variants if v.status == "evaluated"}

            # compute / wall-clock cap
            if not self.guards.within_caps(self._sandboxes_used, time.time() - started):
                break
            if best_fitness >= 1.0:
                break  # solved

            # Mutate the next generation (elitism keeps the elite unchanged)
            offspring = self.mutator.mutate_offspring(
                elite, variants, self.config.population_size - len(elite), generation=gen_index + 1
            )
            for child in offspring:
                self._emit("mutation", {
                    "genome_id": child.genome_id,
                    "parents": child.parent_ids,
                    "note": child.lineage_note,
                    "generation": child.generation,
                })
            population = [e.genome for e in elite] + offspring

        record.final_champion = champion.genome if champion else None
        if gen0_outputs is not None and champion is not None:
            record.config["offline_report"] = self.fitness.offline_report(
                gen0_outputs, champion.raw_outputs
            )
        self._emit("run_complete", {
            "run_id": run_id,
            "final_fitness": round(best_fitness, 4),
            "generations": len(record.generations),
        })
        return record

    # ------------------------------------------------------------------ #

    def _evaluate_population(self, population: list[Genome], task, gen_index: int) -> list[Variant]:  # noqa: ANN001
        """Evaluate every genome in its own sandbox, scored by the fitness fn. Parallel."""
        handles = self.sandboxes.acquire(len(population))
        self._sandboxes_used += len(population)

        def evaluate_one(genome: Genome, handle) -> Variant:  # noqa: ANN001
            t0 = time.time()
            # Pillar 2: screen for grader tampering before running anything
            reason = self.guards.screen(genome)
            if reason is not None:
                v = Variant(genome=genome, fitness=0.0, sandbox_id=handle.sandbox_id, status="rejected")
                v.raw_outputs = {}
                return v
            snapshot_id = None
            try:
                snapshot_id = self.sandboxes.snapshot(handle)
            except Exception:  # noqa: BLE001
                pass
            experiment_url = ""
            try:
                outputs = run_agent_in_sandbox(self.sandboxes, handle, genome, task, self.guards)
                result = self.fitness.score(outputs, genome=genome, generation=gen_index)
                fitness, per_case, experiment_url = (
                    result.fitness, result.per_case, result.experiment_url
                )
                status = "evaluated"
            except Exception as e:  # noqa: BLE001 - a broken variant is simply unfit
                outputs, per_case, fitness, status = {}, [], 0.0, "failed"
                self._emit("guard", {"guard": "variant_failed", "genome_id": genome.genome_id, "error": str(e)})
            # mutation-call stats recorded by the mutator when this genome was created
            mstats = getattr(self.mutator, "call_stats", {}).pop(genome.genome_id, None) or {}
            v = Variant(
                genome=genome,
                fitness=fitness,
                per_case=per_case,
                raw_outputs=outputs,
                cost_est=round(mstats.get("cost_est", 0.0), 6),
                p50_latency_ms=int(mstats.get("latency_ms", 0)),
                braintrust_experiment_url=experiment_url,
                sandbox_id=handle.sandbox_id,
                snapshot_id=snapshot_id,
                status=status,
                duration_ms=int((time.time() - t0) * 1000),
            )
            self._emit("variant_evaluated", {
                "genome_id": genome.genome_id,
                "model": genome.model,
                "fitness": round(fitness, 4),
                "cost_est": v.cost_est,
                "p50_latency_ms": v.p50_latency_ms,
                "status": status,
                "generation": gen_index,
            })
            return v

        max_workers = min(len(population), 16) or 1
        with cf.ThreadPoolExecutor(max_workers=max_workers) as pool:
            variants = list(
                pool.map(lambda pair: evaluate_one(*pair), zip(population, handles, strict=True))
            )
        return variants
