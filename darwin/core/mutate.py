"""Mutation + crossover. LANE C owns this file (see CONTRIBUTING.md lane map).

Phase 0 ships the deterministic OFFLINE canned mutator: given a parent's failure traces, it
advances the worst-scoring problem one rung along its ladder (broken -> correct). Because a
higher rung never passes fewer cases, offspring are monotonically better-or-equal, which (with
elitism) makes the on-stage curve climb reliably with all flags off.

Phase 3 (this file, behind FEATURE_FIREWORKS): each offspring is produced by ONE Fireworks
function-calling request, run on the PARENT'S model gene - so the model race is literal: each
lineage's model rewrites that lineage's code, and better models climb faster. The call returns
{target, new_content, lineage_note} where target is one of prompt | params | model |
tool:<name>. The "model" target swaps the gene to another catalog model. Any API error,
malformed reply, or invalid mutation falls back to the canned ladder child, so the climb never
stalls (DECISIONS D2).

Live-probe findings baked in (2026-07-24, see LEARNINGS.md):
  * tool_choice must FORCE the function - some models (kimi-k2p6) otherwise reply with prose.
  * Returned arguments need strict validation - models fill `target` loosely.

HARD RULE: the mutator only ever receives a Genome, never the fitness code. It cannot reach the
grader by construction (DECISIONS D3). GRADER_TOKENS screening here is defense in depth on top
of guards.screen().
"""

from __future__ import annotations

import concurrent.futures as cf
import json
import statistics

from darwin.config import Config
from darwin.core.fw_client import FireworksClient
from darwin.core.genome import Genome
from darwin.core.population import Variant
from darwin.eval.task import Task
from darwin.safety.guards import GRADER_TOKENS

_MUTATION_TOOL = {
    "type": "function",
    "function": {
        "name": "rewrite_genome",
        "description": (
            "Propose exactly one mutation to the agent genome to fix its failing tests."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": (
                        "What to mutate. MUST be exactly one of: 'prompt' (rewrite the system "
                        "prompt), 'params' (new_content is a JSON object of float params), "
                        "'model' (new_content is a model id from the provided catalog), or "
                        "'tool:<problem_id>' (new_content is the full replacement Python "
                        "source for that tool)."
                    ),
                },
                "new_content": {"type": "string"},
                "lineage_note": {
                    "type": "string",
                    "description": "One short sentence: what changed and why.",
                },
            },
            "required": ["target", "new_content", "lineage_note"],
        },
    },
}


class Mutator:
    def __init__(self, config: Config, task: Task, *, fw: FireworksClient | None = None):
        self.config = config
        self.task = task
        self.fw = fw if fw is not None else FireworksClient(config)
        self.use_fireworks = self.fw.enabled
        # the model race: gen-0 seeding reads this (engine round-robins genomes across it)
        self.race_models: list[str] = self.fw.catalog() if self.use_fireworks else []
        # per-child mutation-call stats; the engine pops these into Variant.cost_est / p50
        self.call_stats: dict[str, dict] = {}
        self._ladders = {p.case_id: p.ladder for p in task.problems}
        self._entrypoints = {p.case_id: p.entrypoint for p in task.problems}
        self._prompts = {p.case_id: p.prompt for p in task.problems}
        self._counter = 0

    # ------------------------------------------------------------------ #

    def mutate_offspring(
        self,
        elite: list[Variant],
        all_variants: list[Variant],
        n: int,
        generation: int = 1,
    ) -> list[Genome]:
        """Produce `n` children from the elite. Fireworks path per-child with canned fallback.

        Fireworks calls run CONCURRENTLY (bounded by the client's semaphore): live p50 was
        ~12.6s per call, so a sequential generation of 6 offspring cost ~75s of pure mutation
        and blew the 2-minute budget (LEARNINGS.md). Parallel, it costs ~one p50.
        """
        if not elite:
            return []
        children: list[Genome | None] = [None] * n
        jobs: list[tuple[int, Variant, str]] = []  # (slot, parent, pre-allocated child id)
        for k in range(n):
            parent = elite[k % len(elite)]
            if generation == self.config.seed_regression_gen and k == 0:
                children[k] = self._canary_child(parent, generation)  # on-stage rollback beat
            elif self.use_fireworks:
                self._counter += 1
                jobs.append((k, parent, f"g{generation}-{self._counter}"))
        latencies: list[int] = []
        if jobs:
            with cf.ThreadPoolExecutor(max_workers=min(len(jobs), 6)) as pool:
                results = pool.map(
                    lambda job: self._fireworks_child(job[1], generation, job[2]), jobs
                )
                for (k, _parent, child_id), child in zip(jobs, results, strict=True):
                    children[k] = child
                    if child is not None and child_id in self.call_stats:
                        latencies.append(self.call_stats[child_id]["latency_ms"])
        for k in range(n):
            if children[k] is None:  # offline path, or a fireworks child that fell through
                children[k] = self._canned_child(elite[k % len(elite)], k, generation)
        if latencies:
            p50 = int(statistics.median(latencies))
            print(
                f"[mutate] gen {generation}: {len(latencies)} fireworks calls (parallel), "
                f"p50 {p50}ms"
            )
        return children

    # ------------------------------------------------------------------ #
    # Fireworks function-calling mutation (Phase 3)
    # ------------------------------------------------------------------ #

    def _fireworks_child(self, parent: Variant, generation: int, child_id: str) -> Genome | None:
        """One function call on the parent's own model gene. None -> caller falls back.
        Thread-safe: `child_id` is pre-allocated by the caller; call_stats keys are unique."""
        try:
            resp, stats = self.fw.chat(
                model=parent.genome.model,
                messages=[
                    {"role": "system", "content": self._mutation_system_prompt()},
                    {"role": "user", "content": self._failure_report(parent)},
                ],
                tools=[_MUTATION_TOOL],
                # force the call: probed models otherwise answer in prose (LEARNINGS.md)
                tool_choice={"type": "function", "function": {"name": "rewrite_genome"}},
                temperature=0.2,
                max_tokens=2048,
            )
            tool_calls = resp.choices[0].message.tool_calls
            if not tool_calls:
                return None
            args = json.loads(tool_calls[0].function.arguments)
            child = self._apply_mutation(parent.genome, args, child_id, generation)
            if child is not None:
                self.call_stats[child_id] = {
                    "latency_ms": stats.latency_ms,
                    "cost_est": stats.cost_est,
                }
            return child
        except Exception:  # noqa: BLE001 - any API/parse failure means: use the canned path
            return None

    def _apply_mutation(
        self, parent: Genome, args: dict, child_id: str, generation: int
    ) -> Genome | None:
        """Validate {target, new_content} strictly; None if the proposal is unusable."""
        target = str(args.get("target", "")).strip()
        content = args.get("new_content", "")
        note = str(args.get("lineage_note", ""))[:200] or f"mutated {target}"
        overrides: dict = {}

        if target == "prompt":
            if not content.strip():
                return None
            overrides["system_prompt"] = content
        elif target == "model":
            if content not in self.race_models:
                return None  # only verified catalog models may enter the gene pool
            overrides["model"] = content
            note = f"model swap -> {content.rsplit('/', 1)[-1]}: {note}"
        elif target == "params":
            try:
                params = {str(k): float(v) for k, v in json.loads(content).items()}
            except (ValueError, TypeError, AttributeError):
                return None
            overrides["params"] = {**parent.params, **params}
        elif target.startswith("tool:"):
            name = target.split(":", 1)[1].strip()
            if name not in parent.tools:
                return None
            if any(tok in content for tok in GRADER_TOKENS):
                return None  # defense in depth; guards.screen would reject it anyway
            try:
                compile(content, f"<mutation:{name}>", "exec")
            except SyntaxError:
                return None
            tools = dict(parent.tools)
            tools[name] = content
            overrides["tools"] = tools
        else:
            return None

        return parent.clone(
            genome_id=child_id,
            generation=generation,
            parent_ids=[parent.genome_id],
            lineage_note=note,
            **overrides,
        )

    def _mutation_system_prompt(self) -> str:
        catalog = ", ".join(self.race_models) if self.race_models else "(catalog unavailable)"
        return (
            "You improve a coding agent by mutating its genome. You will see its failing "
            "tests. Call rewrite_genome exactly once with the single highest-impact fix. "
            "Almost always that is target 'tool:<problem_id>' with corrected full Python "
            "source for the worst-failing tool (keep the same function name/signature). "
            "Only pick target 'model' if the code already looks correct but scores poorly; "
            f"allowed model ids: {catalog}. "
            "Never import anything outside the Python standard library."
        )

    def _failure_report(self, parent: Variant) -> str:
        """Failure traces (SPEC section 11: informed by Variant.per_case), worst problems first."""
        fails = self._fail_counts(parent)
        lines = [
            f"Genome {parent.genome.genome_id} scored {parent.fitness:.0%}. Failing problems:"
        ]
        shown = 0
        for problem_id, fail_count in sorted(fails.items(), key=lambda kv: -kv[1]):
            if fail_count == 0 or shown >= 3:
                continue
            shown += 1
            errors = [
                pc.error
                for pc in parent.per_case
                if pc.case_id.startswith(f"{problem_id}#") and pc.error
            ]
            lines.append(
                f"\n## {problem_id} (entrypoint `{self._entrypoints.get(problem_id, '?')}`, "
                f"{fail_count} failing cases)\n"
                f"Spec: {self._prompts.get(problem_id, '')}\n"
                f"Current source:\n```python\n{parent.genome.tools.get(problem_id, '')}\n```\n"
                f"Failures: {'; '.join(errors[:3])}"
            )
        if shown == 0:
            lines.append("(no per-case traces available; improve the weakest tool)")
        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    # Seeded regression canary (the on-stage rollback beat, SPEC section 7)
    # ------------------------------------------------------------------ #

    def _canary_child(self, parent: Variant, generation: int) -> Genome:
        """A deliberately-regressing child: guards.filter must reject + roll it back."""
        self._counter += 1
        tools = dict(parent.genome.tools)
        if tools:
            worst = next(iter(sorted(tools)))
            tools[worst] = (
                f"def {self._entrypoints.get(worst, 'solve')}(*args):\n"
                "    raise RuntimeError('seeded regression canary')\n"
            )
        return parent.genome.clone(
            genome_id=f"g{generation}-{self._counter}-canary",
            generation=generation,
            parent_ids=[parent.genome.genome_id],
            tools=tools,
            lineage_note="SEEDED regression canary (demo: auto-reject + rollback)",
        )

    # ------------------------------------------------------------------ #
    # Offline canned mutation (Phase 0, the demo floor - unchanged)
    # ------------------------------------------------------------------ #

    def _canned_child(self, parent: Variant, k: int, generation: int) -> Genome:
        targets = self._improvable_problems(parent)
        child_tools = dict(parent.genome.tools)
        note = "no improvable problem; carried forward"
        if targets:
            # offspring k targets the k-th worst improvable problem, for diversity
            problem_id = targets[k % len(targets)]
            ladder = self._ladders.get(problem_id, [])
            cur = child_tools.get(problem_id, "")
            idx = ladder.index(cur) if cur in ladder else 0
            if idx + 1 < len(ladder):
                child_tools[problem_id] = ladder[idx + 1]
                note = f"rewrote tool '{problem_id}' (ladder rung {idx} -> {idx + 1})"
        self._counter += 1
        return parent.genome.clone(
            genome_id=f"g{generation}-{self._counter}",
            generation=generation,
            parent_ids=[parent.genome.genome_id],
            tools=child_tools,
            lineage_note=note,
        )

    def _improvable_problems(self, parent: Variant) -> list[str]:
        """Problems the parent fails and whose ladder still has a better rung, worst first."""
        fails = self._fail_counts(parent)
        candidates = []
        for problem_id, fail_count in sorted(fails.items(), key=lambda kv: -kv[1]):
            if fail_count == 0:
                continue
            ladder = self._ladders.get(problem_id, [])
            cur = parent.genome.tools.get(problem_id, "")
            idx = ladder.index(cur) if cur in ladder else 0
            if idx + 1 < len(ladder):
                candidates.append(problem_id)
        return candidates

    @staticmethod
    def _fail_counts(parent: Variant) -> dict[str, int]:
        counts: dict[str, int] = {}
        for pc in parent.per_case:
            problem_id = pc.case_id.split("#", 1)[0]
            counts.setdefault(problem_id, 0)
            if pc.score < 1.0:
                counts[problem_id] += 1
        return counts
