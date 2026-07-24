"""Routing-card tests: per-task champions become auditable model choices."""

from __future__ import annotations

from darwin.core.genome import Genome
from darwin.core.population import Generation, RunRecord, Variant, build_routing_card


def _record(task_id: str, champion_model: str, runner_model: str) -> RunRecord:
    champion = Genome(
        genome_id=f"{task_id}-champion",
        model=champion_model,
        system_prompt=f"Prompt for {task_id}",
    )
    runner_up = Genome(genome_id=f"{task_id}-runner", model=runner_model)
    return RunRecord(
        run_id=f"run-{task_id}",
        task_id=task_id,
        seed=1337,
        generations=[
            Generation(
                index=0,
                variants=[
                    Variant(
                        genome=champion,
                        fitness=0.92,
                        cost_est=0.014,
                        p50_latency_ms=180,
                    ),
                    Variant(genome=runner_up, fitness=0.84, cost_est=0.009, p50_latency_ms=120),
                ],
            )
        ],
        final_champion=champion,
    )


def test_build_routing_card_uses_champion_and_distinct_model_runner_up():
    card = build_routing_card(
        "legal",
        [
            _record("legal_renewal", "kimi", "glm"),
            _record("legal_clause_type", "glm", "kimi"),
        ],
    )

    assert card.industry == "legal"
    assert [entry.task_id for entry in card.entries] == ["legal_clause_type", "legal_renewal"]
    entry = card.entries[0]
    assert entry.best_model == "glm"
    assert entry.runner_up == "kimi"
    assert entry.score == 0.92
    assert entry.cost == 0.014
    assert entry.latency == 180
    assert "distinct-model alternative" in entry.rationale


def test_build_routing_card_skips_unfinished_runs():
    unfinished = RunRecord(run_id="unfinished", task_id="legal_unknown", seed=1337)

    card = build_routing_card("legal", [unfinished])

    assert card.entries == []
