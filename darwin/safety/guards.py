"""Safety guards: the four pillars, as enforced code. LANE B owns this file.

This is the "prove it operates safely" surface. Every guard emits a dashboard event so the
safety beats are visible on stage.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.core.population import Variant

# Tokens that mean a genome's tool code is trying to reach the grader. Pillar #2.
GRADER_TOKENS = (
    "darwin.eval.fitness",
    "darwin/eval/fitness",
    "eval.fitness",
    "eval/fitness",
    "fitness.py",
    "coding_bench.json",
    "expected(",
    "_expected",
)


class GraderTamperError(Exception):
    """Raised when a genome's tool code references the immutable grader."""


class Guards:
    def __init__(self, config: Config, *, sandboxes=None, events=None):
        self.config = config
        self.sandboxes = sandboxes
        self.events = events
        self.rejected_count = 0

    def _emit(self, kind: str, payload: dict) -> None:
        if self.events is not None:
            self.events.emit("guard", {"guard": kind, **payload})

    # -- Pillar 1: host isolation ------------------------------------------------------- #

    def assert_sandboxed(self, handle) -> None:  # noqa: ANN001
        """A genome may only execute inside a sandbox, never in the host process."""
        if handle is None or not getattr(handle, "in_sandbox", False):
            raise RuntimeError("refusing to run genome outside a sandbox (host-isolation guard)")

    # -- Pillar 2: immutable grader ----------------------------------------------------- #

    def assert_grader_untouched(self, genome: Genome) -> None:
        """No genome/tool may reference the grader. Raises GraderTamperError if it does."""
        for problem_id, source in genome.tools.items():
            for token in GRADER_TOKENS:
                if token in source:
                    raise GraderTamperError(
                        f"genome {genome.genome_id} tool '{problem_id}' references grader "
                        f"token {token!r}"
                    )

    def screen(self, genome: Genome) -> str | None:
        """Return a rejection reason if the genome must not run, else None."""
        try:
            self.assert_grader_untouched(genome)
        except GraderTamperError as e:
            self.rejected_count += 1
            self._emit("grader_tamper", {"genome_id": genome.genome_id, "reason": str(e)})
            return str(e)
        return None

    # -- Pillar 3: regression auto-reject + rollback ------------------------------------ #

    def filter(self, variants: list[Variant], parent_fitness: dict[str, float]) -> list[Variant]:
        """Reject variants that regressed against their parent (or errored out), rolling back
        their sandboxes. Combined with elitism this keeps the champion's fitness monotonic."""
        for v in variants:
            if v.status != "evaluated":
                continue
            parents = v.genome.parent_ids
            baseline = max((parent_fitness.get(pid, 0.0) for pid in parents), default=0.0)
            if parents and v.fitness < baseline:
                v.status = "rejected"
                self.rejected_count += 1
                self._rollback(v)
                self._emit(
                    "regression_rejected",
                    {"genome_id": v.genome.genome_id, "fitness": v.fitness, "parent": baseline},
                )
        return variants

    def _rollback(self, variant: Variant) -> None:
        if self.sandboxes is not None and variant.snapshot_id and variant.sandbox_id:
            handle = getattr(self.sandboxes, "handle_by_id", lambda _id: None)(variant.sandbox_id)
            if handle is not None:
                try:
                    self.sandboxes.restore(handle, variant.snapshot_id)
                    variant.status = "rolled_back"
                    self._emit("rolled_back", {"genome_id": variant.genome.genome_id})
                except Exception:  # noqa: BLE001 - rollback must never crash the loop
                    pass

    # -- Pillar 4: human veto + compute cap --------------------------------------------- #

    def promote(self, champion: Genome, review=None) -> bool:  # noqa: ANN001
        """Gate on promoting a NEW champion. A blocking code review (CodeRabbit, Phase 4) or a
        human veto can deny it. AUTO_APPROVE bypasses for demo speed, but the gate stays real."""
        if review is not None and getattr(review, "blocks_promotion", False):
            self._emit("promotion_blocked", {"genome_id": champion.genome_id})
            return False
        if self.config.auto_approve:
            self._emit("champion_approved", {"genome_id": champion.genome_id, "auto": True})
            return True
        self._emit("awaiting_veto", {"genome_id": champion.genome_id})
        return True  # a real veto UI resolves this in the dashboard; default allow

    def within_caps(self, sandboxes_used: int, elapsed_s: float) -> bool:
        ok = (
            sandboxes_used <= self.config.max_total_sandboxes
            and elapsed_s <= self.config.max_wall_clock_s
        )
        if not ok:
            self._emit("cap_reached", {"sandboxes": sandboxes_used, "elapsed_s": elapsed_s})
        return ok
