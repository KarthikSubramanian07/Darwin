"""Fitness = a Braintrust eval used as the selection pressure. LANE C owns this file.

IMMUTABLE GRADER (safety pillar #2): this module is never serialized into a genome, never
handed to the mutator, and never placed in a sandbox the agent can write to. A test in
tests/test_immutable_grader.py asserts no genome/tool references this module. This is the
"it can't cheat its own grader" property. Do not weaken it.

VERIFY the Braintrust API (Eval(), scorers, experiment logging) against current docs before
writing calls.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.eval.task import Task


class Fitness:
    """Scores a variant's outputs. Backed by Braintrust; falls back to a local scorer."""

    def __init__(self, config: Config, task: Task):
        self.config = config
        self.task = task
        self.use_braintrust = config.features.braintrust

    def score(self, variant_outputs) -> tuple[float, list]:  # noqa: ANN001
        """Run the eval over `variant_outputs`.

        Returns (aggregate_fitness in 0..1, per_case list) where per_case carries the
        low-scoring outputs / errors the mutator uses as failure traces.

        TODO(Lane C):
          * Braintrust path: log each variant as an experiment tagged genome_id + generation.
          * Fallback (config.features.braintrust == False): local deterministic scorer with
            the SAME signature so the loop runs offline.
        """
        raise NotImplementedError

    def offline_report(self, gen0_champion, final_champion):  # noqa: ANN001
        """Held-out before/after eval (gen-0 vs final) for the writeup. TODO(Lane C)."""
        raise NotImplementedError
