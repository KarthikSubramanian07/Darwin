"""Safety guards: the four pillars, as enforced code. LANE B owns this file.

This is the "prove it operates safely" surface. Test it.

  1. Host-isolation assertion — before any genome runs, assert it executes inside a sandbox,
     never in the host process. A genome's tool code is never imported into the engine.
  2. Immutable fitness — the grader is never handed to the mutator or placed in a writable
     sandbox path (see eval/fitness.py + core/mutate.py). assert_grader_untouched() below.
  3. Regression auto-reject + rollback — a variant scoring below its parent (or that errored)
     is marked rejected/rolled_back, its sandbox restored, and it cannot enter the elite.
     Combined with elitism, the champion's fitness is monotonic.
  4. Human veto + compute cap — promote() requires approval (AUTO_APPROVE allowed for demo
     speed, but the gate must be real and demonstrable); enforce MAX_TOTAL_SANDBOXES /
     MAX_WALL_CLOCK_S so evolution can't run away.

Each guard emits a dashboard event so the safety beats are visible.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.core.population import Variant


class Guards:
    def __init__(self, config: Config, *, sandboxes=None, events=None):
        self.config = config
        self.sandboxes = sandboxes
        self.events = events

    def assert_sandboxed(self, context) -> None:  # noqa: ANN001
        """Pillar 1: assert genome execution is happening inside a sandbox. TODO(Lane B)."""
        raise NotImplementedError

    def assert_grader_untouched(self, genome: Genome) -> None:
        """Pillar 2: assert no genome/tool references the fitness module. TODO(Lane B).
        Used by tests/test_immutable_grader.py."""
        raise NotImplementedError

    def filter(self, variants: list[Variant], prev_best: float) -> list[Variant]:
        """Pillar 3: reject regressions/errors, roll back their sandboxes. TODO(Lane B)."""
        raise NotImplementedError

    def promote(self, champion: Genome) -> bool:
        """Pillar 4: human-veto gate on a new champion. AUTO_APPROVE bypasses for demo speed
        but the gate stays real. TODO(Lane B)."""
        raise NotImplementedError

    def within_caps(self, sandboxes_used: int, elapsed_s: float) -> bool:
        """Pillar 4: compute + wall-clock cap. TODO(Lane B)."""
        raise NotImplementedError
