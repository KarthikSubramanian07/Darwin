"""Fitness = the selection pressure, backed by Braintrust. LANE B owns this file.

The eval is not a report you read afterward; it is the fitness function that decides which
variants survive. Every variant is scored per-case by a `task_type`-appropriate scorer and, when
Braintrust is enabled, logged as an experiment so the population's climb is auditable evidence.

The numeric truth is computed locally with the same scorer either way, so the offline path and
the Braintrust path agree on deterministic (code/structured) tasks and the demo floor never
depends on the network.

IMMUTABLE GRADER (safety pillar #2): this module is never serialized into a genome, never handed
to the mutator, and never placed in a sandbox the agent can write to. The expected answers live
here and only here. tests/test_immutable_grader.py asserts the property. Do not weaken it.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.population import PerCase
from darwin.eval.braintrust_logger import BraintrustLogger
from darwin.eval.scorers import autoevals_scorer, score_case
from darwin.eval.task import Task
from darwin.sandbox.base import RunOutputs


class ScoreResult:
    """What `Fitness.score` returns: the aggregate, the per-case detail (failure traces for the
    mutator), and the Braintrust experiment URL (empty when logging is off)."""

    __slots__ = ("fitness", "per_case", "experiment_url")

    def __init__(self, fitness: float, per_case: list[PerCase], experiment_url: str = ""):
        self.fitness = fitness
        self.per_case = per_case
        self.experiment_url = experiment_url

    def __iter__(self):
        # backwards-compatible with `fitness, per_case = score(...)` unpacking
        yield self.fitness
        yield self.per_case


class Fitness:
    def __init__(self, config: Config, task: Task):
        self.config = config
        self.task = task
        self.use_braintrust = config.features.braintrust
        self.logger = BraintrustLogger(config, task)
        # grader-side views, host-only
        self._problems = {p.case_id: p for p in task.problems}
        self._expected = task.expected()

    # ------------------------------------------------------------------ #

    def score(self, outputs: RunOutputs, *, genome=None, generation: int = 0, **_ignore) -> ScoreResult:  # noqa: ANN001
        """Score a variant's sandbox outputs. Returns a ScoreResult (also tuple-unpackable to
        `(fitness, per_case)` for older call sites)."""
        per_case, rows, fitness = self._grade(outputs)
        url = self.logger.log_variant(genome, generation, rows) if genome is not None else ""
        return ScoreResult(fitness, per_case, url)

    # ------------------------------------------------------------------ #

    def _grade(self, outputs: RunOutputs):
        per_case: list[PerCase] = []
        rows: list[dict] = []
        passed = 0.0
        total = 0
        for problem_id, problem in self._problems.items():
            task_type = problem.task_type
            scorer_name = type(autoevals_scorer(task_type)).__name__ if self.use_braintrust else "score"
            got_list = outputs.get(problem_id, [])
            for idx, case in enumerate(problem.cases):
                total += 1
                expected = case.expected
                entry = got_list[idx] if idx < len(got_list) else {"got": None, "error": "missing"}
                got = entry.get("got")
                err = entry.get("error")
                s = score_case(task_type, got, expected, err)
                passed += s
                if s >= 1.0:
                    detail = None
                elif err is not None:
                    detail = f"raised: {err}"
                else:
                    detail = f"expected {expected!r}, got {got!r}"
                per_case.append(
                    PerCase(case_id=f"{problem_id}#{idx}", score=s, output=got, error=detail)
                )
                rows.append(
                    {
                        "problem_id": problem_id,
                        "case_index": idx,
                        "input": {"entrypoint": problem.entrypoint, "args": case.args},
                        "output": got,
                        "expected": expected,
                        "error": err,
                        "score": s,
                        "scorer": scorer_name,
                    }
                )
        fitness = passed / total if total else 0.0
        return per_case, rows, fitness

    # ------------------------------------------------------------------ #

    def offline_report(self, gen0_outputs: RunOutputs, final_outputs: RunOutputs) -> dict:
        """Before/after table (gen-0 vs final champion) for the writeup."""
        _, _, g0 = self._grade(gen0_outputs)
        _, _, gf = self._grade(final_outputs)
        return {
            "gen0_fitness": round(g0, 4),
            "final_fitness": round(gf, 4),
            "delta": round(gf - g0, 4),
            "total_cases": self.task.total_cases,
            "scored_by": "braintrust" if self.logger.enabled else "local",
        }
