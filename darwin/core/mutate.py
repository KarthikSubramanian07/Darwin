"""Fireworks-powered mutation + crossover. LANE A owns this file.

Each offspring: call a fast Fireworks model (OpenAI-compatible API, function-calling)
with the parent genome (prompt + tool code) and its failure traces (per_case errors /
low-scoring outputs from Braintrust), and an instruction to propose a concrete improvement.
The function schema returns a structured mutation:

    { "target": "prompt" | "tool:<name>" | "params",
      "new_content": str,
      "lineage_note": str }

Apply it to a copy of the parent to make the child.

HARD RULE: the mutator may edit system_prompt, tools, and params. It may NEVER touch
eval/ or fitness.py. Enforced by construction: the mutator is only ever handed a Genome,
never the fitness code.

VERIFY the Fireworks base_url, a current fast model id, and the function-calling schema in
the official docs before writing calls. Fires many times per generation, so keep calls
concurrent and log count + p50 latency (Fireworks writeup evidence).
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.core.population import Variant


class Mutator:
    def __init__(self, config: Config):
        self.config = config
        self.use_fireworks = config.features.fireworks

    def mutate_offspring(
        self, elite: list[Variant], all_variants: list[Variant], n: int
    ) -> list[Genome]:
        """Produce `n` mutated/crossed-over children from the elite.

        TODO(Lane A):
          * Fireworks path: structured function-calling mutation informed by failure traces.
          * Crossover: occasionally combine a strong tool from one elite with another's prompt.
          * Fallback (config.features.fireworks == False): deterministic canned edits that
            still improve the seed task, so the loop climbs offline.
        """
        raise NotImplementedError
