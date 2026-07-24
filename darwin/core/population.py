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


class RoutingEntry(BaseModel):
    """The champion evidence for one task in an industry routing decision."""

    task_id: str
    best_model: str
    prompt: str
    runner_up: str = ""
    score: float = 0.0
    cost: float = 0.0
    latency: int = 0
    rationale: str = ""


class RoutingCard(BaseModel):
    """A per-industry model-routing result, built only from completed run records."""

    industry: str
    entries: list[RoutingEntry] = Field(default_factory=list)


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


def build_routing_card(industry: str, records: list[RunRecord]) -> RoutingCard:
    """Fold completed task runs into an auditable, deterministically ordered routing card.

    A runner-up must use a different model from the champion. This avoids presenting two prompt
    variants of the same model as a model-routing choice. Empty cost and latency values are
    preserved as zero until Fireworks evaluation accounting is wired in.
    """
    entries: list[RoutingEntry] = []
    for record in records:
        champion = record.final_champion
        if champion is None:
            continue
        variants = [
            variant
            for generation in record.generations
            for variant in generation.variants
            if variant.status == "evaluated"
        ]
        champion_results = [
            variant for variant in variants if variant.genome.genome_id == champion.genome_id
        ]
        if champion_results:
            champion_result = rank(champion_results)[0]
        else:
            champion_result = Variant(genome=champion)
        alternatives = [
            variant for variant in variants if variant.genome.model != champion.model
        ]
        runner_up = rank(alternatives)[0] if alternatives else None
        rationale = f"Champion score {champion_result.fitness:.3f} on {record.task_id}."
        if runner_up is not None:
            rationale += (
                f" Best distinct-model alternative was {runner_up.genome.model} "
                f"at {runner_up.fitness:.3f}."
            )
        else:
            rationale += " No distinct-model alternative was evaluated."
        entries.append(
            RoutingEntry(
                task_id=record.task_id,
                best_model=champion.model,
                prompt=champion.system_prompt,
                runner_up=runner_up.genome.model if runner_up is not None else "",
                score=champion_result.fitness,
                cost=champion_result.cost_est,
                latency=champion_result.p50_latency_ms,
                rationale=rationale,
            )
        )
    return RoutingCard(industry=industry, entries=sorted(entries, key=lambda entry: entry.task_id))
