"""Fitness = the selection pressure. LANE C owns this file.

Phase 0 ships the local deterministic scorer. Braintrust (the eval as fitness function + per
-variant experiment logging) layers on in Phase 2 behind FEATURE_BRAINTRUST with this exact
signature, so the engine never changes.

IMMUTABLE GRADER (safety pillar #2): this module is never serialized into a genome, never
handed to the mutator, and never placed in a sandbox the agent can write to. The expected
answers live here and only here. tests/test_immutable_grader.py asserts the property. Do not
weaken it.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.population import PerCase
from darwin.eval.task import Task
from darwin.sandbox.base import RunOutputs


class Fitness:
    """Scores a variant's sandbox outputs against the grader-side expected answers."""

    def __init__(self, config: Config, task: Task):
        self.config = config
        self.task = task
        self.use_braintrust = config.features.braintrust
        self._expected = task.expected()

    def score(self, outputs: RunOutputs, *, genome_id: str = "", generation: int = 0):
        """Return (aggregate_fitness in 0..1, per_case list).

        per_case carries the failing cases (expected vs got / error) that the mutator uses as
        failure traces. Braintrust logging is added in Phase 2; the local scoring below is the
        offline fallback and the ground truth either way.
        """
        return self._local_score(outputs)

    def _local_score(self, outputs: RunOutputs) -> tuple[float, list[PerCase]]:
        per_case: list[PerCase] = []
        passed = 0
        total = 0
        for problem_id, expected_list in self._expected.items():
            got_list = outputs.get(problem_id, [])
            for idx, expected in enumerate(expected_list):
                total += 1
                entry = got_list[idx] if idx < len(got_list) else {"got": None, "error": "missing"}
                got = entry.get("got")
                err = entry.get("error")
                ok = err is None and got == expected
                if ok:
                    passed += 1
                    detail = None
                elif err is not None:
                    detail = f"raised: {err}"
                else:
                    detail = f"expected {expected!r}, got {got!r}"
                per_case.append(
                    PerCase(
                        case_id=f"{problem_id}#{idx}",
                        score=1.0 if ok else 0.0,
                        output=got,
                        error=detail,
                    )
                )
        fitness = passed / total if total else 0.0
        return fitness, per_case

    def offline_report(self, gen0_outputs: RunOutputs, final_outputs: RunOutputs) -> dict:
        """Before/after table (gen-0 vs final champion) for the writeup."""
        g0, _ = self._local_score(gen0_outputs)
        gf, _ = self._local_score(final_outputs)
        return {
            "gen0_fitness": round(g0, 4),
            "final_fitness": round(gf, 4),
            "delta": round(gf - g0, 4),
            "total_cases": self.task.total_cases,
        }
