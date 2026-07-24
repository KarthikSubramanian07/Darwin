"""Population / Generation bookkeeping, elitism, and selection.

LANE A owns this file.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from darwin.core.genome import Genome

VariantStatus = Literal["evaluated", "failed", "rejected", "rolled_back"]


class PerCase(BaseModel):
    case_id: str
    score: float
    output: object | None = None
    error: str | None = None


class Variant(BaseModel):
    """A genome plus its measured result."""

    genome: Genome
    fitness: float = 0.0  # 0..1 from the Braintrust eval
    per_case: list[PerCase] = Field(default_factory=list)
    sandbox_id: str = ""
    snapshot_id: str | None = None
    status: VariantStatus = "evaluated"
    duration_ms: int = 0


class Generation(BaseModel):
    index: int
    variants: list[Variant] = Field(default_factory=list)
    best_fitness: float = 0.0
    champion_id: str = ""
    started_at: float = 0.0
    ended_at: float = 0.0


class RunRecord(BaseModel):
    """Canonical persisted record. The dashboard + offline replay read this."""

    run_id: str
    task_id: str
    seed: int
    generations: list[Generation] = Field(default_factory=list)
    fitness_curve: list[float] = Field(default_factory=list)  # best_fitness per gen (the climb)
    final_champion: Genome | None = None
    config: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------- #
# TODO(Lane A): selection helpers.
# ---------------------------------------------------------------------- #


def select(variants: list[Variant], elite_k: int) -> list[Variant]:
    """Return the top `elite_k` variants by fitness (the elite that inherit)."""
    raise NotImplementedError
