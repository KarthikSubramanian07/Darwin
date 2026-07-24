"""Pipeline tests: an industry decomposes into runnable tasks that climb offline."""

import pytest

from darwin.config import load_config
from darwin.core.engine import EvolutionEngine
from darwin.core.mutate import Mutator
from darwin.eval.fitness import Fitness
from darwin.eval.task import Task
from darwin.safety.guards import Guards
from darwin.sandbox.local import LocalSandboxPool
from darwin.server.events import EventChannel
from pipeline.build import build_industry_task, write_task
from pipeline.decompose import industry_to_tasks
from pipeline.synth import synth_cases


@pytest.fixture
def offline(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS"):
        monkeypatch.setenv(var, "0")
    monkeypatch.delenv("FIREWORKS_API_KEY", raising=False)


def test_decompose_known_industry(offline):
    specs = industry_to_tasks("legal", load_config())
    assert len(specs) == 3
    assert {s.case_id for s in specs} == {"redact_emails", "extract_amounts", "count_sections"}


def test_synth_returns_cases_for_a_spec(offline):
    specs = industry_to_tasks("support", load_config())
    cases = synth_cases(specs[0], load_config())
    assert len(cases) >= 2
    assert all("args" in c and "expected" in c for c in cases)


def test_unknown_industry_still_produces_a_valid_task(offline):
    task = build_industry_task("underwater basket weaving", load_config())
    assert task.problems  # never empty
    assert task.total_cases >= 0


def test_build_and_load_roundtrip(offline, tmp_path, monkeypatch):
    import pipeline.build as build_mod

    monkeypatch.setattr(build_mod, "DATA_DIR", tmp_path)
    # also point Task.load at the same dir
    monkeypatch.setattr("darwin.eval.task.DATA_DIR", tmp_path)
    task = build_industry_task("legal", load_config())
    path = write_task(task)
    assert path.exists()
    loaded = Task.load("legal")
    assert loaded.industry == "legal"
    assert loaded.total_cases == 6


def test_industry_task_climbs_offline(offline):
    config = load_config()
    task = build_industry_task("legal", config)
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
        record = engine.run(task)
    finally:
        sandboxes.close()
    curve = record.fitness_curve
    assert all(b >= a for a, b in zip(curve, curve[1:], strict=False)), curve
    assert curve[-1] >= 0.9, curve  # climbs to near-solved
