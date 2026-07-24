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
    raw_outputs: dict = Field(default_factory=dict)  # problem_id -> [{got, error}]
    cost_est: float = 0.0  # $ estimate for this variant's eval (Fireworks)
    p50_latency_ms: int = 0  # median model-call latency (Fireworks)
    braintrust_experiment_url: str = ""  # link to the experiment (Braintrust)
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
# Selection
# ---------------------------------------------------------------------- #


def rank(variants: list[Variant]) -> list[Variant]:
    """Variants sorted by fitness, highest first. Ties broken by faster runtime, then id
    (so ordering is deterministic for a fixed run)."""
    return sorted(
        variants,
        key=lambda v: (-v.fitness, v.duration_ms, v.genome.genome_id),
    )


def select(variants: list[Variant], elite_k: int) -> list[Variant]:
    """Return the top `elite_k` eligible variants by fitness (the elite that inherit).

    Only variants that were actually evaluated can be elite; rejected / rolled-back / failed
    variants are never carried forward. Elitism over this set is what keeps best_fitness
    monotonic across generations.
    """
    eligible = [v for v in variants if v.status == "evaluated"]
    return rank(eligible)[: max(1, elite_k)]
