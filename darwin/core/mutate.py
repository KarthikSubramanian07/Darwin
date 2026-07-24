"""Mutation + crossover. LANE A owns this file.

Phase 0 ships the deterministic OFFLINE canned mutator: given a parent's failure traces, it
advances the worst-scoring problem one rung along its ladder (broken -> correct). Because a
higher rung never passes fewer cases, offspring are monotonically better-or-equal, which (with
elitism) makes the on-stage curve climb reliably with all flags off.

Phase 3 adds the Fireworks path behind FEATURE_FIREWORKS: a fast model reads the same failure
traces and writes a real fix via function-calling. Same signature, so the engine never changes.

HARD RULE: the mutator only ever receives a Genome, never the fitness code. It cannot reach the
grader by construction.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.core.population import Variant
from darwin.eval.task import Task


class Mutator:
    def __init__(self, config: Config, task: Task):
        self.config = config
        self.task = task
        self.use_fireworks = config.features.fireworks
        self._ladders = {p.case_id: p.ladder for p in task.problems}
        self._counter = 0

    # ------------------------------------------------------------------ #

    def mutate_offspring(
        self,
        elite: list[Variant],
        all_variants: list[Variant],
        n: int,
        generation: int = 1,
    ) -> list[Genome]:
        """Produce `n` children from the elite. Phase 0 uses the canned ladder mutator."""
        if not elite:
            return []
        children: list[Genome] = []
        for k in range(n):
            parent = elite[k % len(elite)]
            children.append(self._canned_child(parent, k, generation))
        return children

    # ------------------------------------------------------------------ #
    # Offline canned mutation
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
