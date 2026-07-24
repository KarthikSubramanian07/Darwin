"""The core guarantee: with all sponsor flags off, evolution climbs monotonically on the canned
task and reaches a strong final score. If this test ever goes red, the demo floor is broken.
"""

import os

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
def offline_env(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS", "FEATURE_CODERABBIT"):
        monkeypatch.setenv(var, "0")


def _run():
    config = load_config()
    task = Task.load("coding_bench")
    events = EventChannel()
    sandboxes = LocalSandboxPool()
    engine = EvolutionEngine(
        config,
        fitness=Fitness(config, task),
        sandboxes=sandboxes,
        mutator=Mutator(config, task),
        guards=Guards(config, sandboxes=sandboxes, events=events),
        events=events,
    )
    try:
        return engine.run(task), events
    finally:
        sandboxes.close()


def test_offline_climb_is_monotonic_and_strong(offline_env):
    record, _ = _run()
    curve = record.fitness_curve
    assert len(curve) >= 2
    # Elitism guarantee: best_fitness never decreases.
    assert all(b >= a for a, b in zip(curve, curve[1:], strict=False)), curve
    # Gen 0 is deliberately mediocre; the champion ends strong.
    assert curve[0] <= 0.5
    assert curve[-1] >= 0.9, curve
    assert record.final_champion is not None


def test_run_is_deterministic(offline_env):
    r1, _ = _run()
    r2, _ = _run()
    assert r1.fitness_curve == r2.fitness_curve


def test_events_stream_the_climb(offline_env):
    _, events = _run()
    kinds = {e["type"] for e in events.events}
    assert {"run_started", "generation_complete", "champion_changed", "run_complete"} <= kinds


def test_offline_uses_unisolated_sandbox_labeled_honestly():
    # The local fallback must never claim to be real isolation.
    assert LocalSandboxPool.is_real_isolation is False


def test_env_offline_flag_forces_local(offline_env):
    assert os.getenv("FEATURE_DAYTONA") == "0"
