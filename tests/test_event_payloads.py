"""The dashboard's live panels depend on these event fields; keep them stable.

variant_evaluated carries per-problem pass rates (the task x model race grid) and mutation
carries the real rewrite diff (the "what it rewrote in itself" panel).
"""

from __future__ import annotations

import pytest

from darwin.config import load_config
from darwin.core.engine import EvolutionEngine
from darwin.core.mutate import Mutator
from darwin.eval.fitness import Fitness
from darwin.eval.task import Task
from darwin.safety.guards import Guards
from darwin.sandbox.local import LocalSandboxPool
from darwin.server.events import EventChannel


@pytest.fixture
def events(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS", "FEATURE_CODERABBIT"):
        monkeypatch.setenv(var, "0")
    monkeypatch.setenv("POPULATION_SIZE", "4")
    monkeypatch.setenv("GENERATIONS", "2")
    config = load_config()
    task = Task.load("coding_bench")
    channel = EventChannel()
    sandboxes = LocalSandboxPool()
    engine = EvolutionEngine(
        config,
        fitness=Fitness(config, task),
        sandboxes=sandboxes,
        mutator=Mutator(config, task),
        guards=Guards(config, sandboxes=sandboxes, events=channel),
        events=channel,
    )
    try:
        engine.run(task)
    finally:
        sandboxes.close()
    return channel.events


def test_variant_evaluated_carries_per_problem_scores(events):
    evals = [e for e in events if e["type"] == "variant_evaluated"]
    assert evals
    task = Task.load("coding_bench")
    problem_ids = {p.case_id for p in task.problems}
    for e in evals:
        problems = e["payload"]["problems"]
        assert set(problems) == problem_ids
        assert all(0.0 <= s <= 1.0 for s in problems.values())


def test_mutation_carries_the_real_rewrite_diff(events):
    mutations = [e for e in events if e["type"] == "mutation"]
    assert mutations
    rewrites = [e["payload"]["rewrite"] for e in mutations if e["payload"].get("rewrite")]
    # the offline ladder mutator rewrites one tool per child, so diffs must exist
    assert rewrites
    for rw in rewrites:
        assert rw["kind"] == "tool"
        assert rw["tool"]
        assert rw["new"] and rw["new"] != rw["old"]


def test_run_started_carries_run_shape(events):
    (started,) = [e for e in events if e["type"] == "run_started"]
    p = started["payload"]
    assert p["generations"] == 2 and p["population_size"] == 4
    assert p["real_isolation"] is False
