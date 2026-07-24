"""Unit tests for the Fireworks mutation adapter. No real network calls are made."""

from __future__ import annotations

import sys
from types import SimpleNamespace

from darwin.core.genome import DEFAULT_MODEL, Genome
from darwin.core.mutate import FIREWORKS_MUTATOR_MODEL, Mutator
from darwin.core.population import PerCase, Variant
from darwin.eval.task import Case, Problem, Task


def _task() -> Task:
    return Task(
        task_id="unit",
        problems=[
            Problem(
                case_id="add",
                entrypoint="add",
                cases=[Case(args=[1, 2], expected=3)],
                ladder=["def add(a, b): return 0", "def add(a, b): return a + b"],
            )
        ],
    )


def test_fireworks_model_mutation_is_applied_without_network(monkeypatch):
    captured = {}

    class FakeOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        def create(self, **kwargs):
            captured["request"] = kwargs
            call = SimpleNamespace(
                function=SimpleNamespace(
                    arguments=(
                        '{"target":"model","new_content":"accounts/fireworks/models/kimi-k2p6",'
                        '"lineage_note":"swapped model for a coding specialist"}'
                    )
                )
            )
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[call]))])

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeOpenAI))
    config = SimpleNamespace(
        features=SimpleNamespace(fireworks=True),
        fireworks_api_key="test-key",
        fireworks_base_url="https://example.test/v1",
    )
    parent = Variant(
        genome=Genome(genome_id="parent", tools={"add": "def add(a, b): return 0"}),
        per_case=[PerCase(case_id="add#0", score=0.0, error="failed")],
    )

    child = Mutator(config, _task()).mutate_offspring([parent], [parent], 1)[0]

    assert child.model == FIREWORKS_MUTATOR_MODEL
    assert child.model != DEFAULT_MODEL
    assert "swapped model" in child.lineage_note
    assert captured["client"]["api_key"] == "test-key"
    assert captured["request"]["tool_choice"]["function"]["name"] == "propose_mutation"


def test_fireworks_failure_is_reported_without_leaking_a_key(monkeypatch):
    class FailingOpenAI:
        def __init__(self, **_kwargs):
            raise RuntimeError("401 invalid API key fw_secret-value")

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FailingOpenAI))
    config = SimpleNamespace(
        features=SimpleNamespace(fireworks=True),
        fireworks_api_key="test-key",
        fireworks_base_url="https://example.test/v1",
    )
    parent = Variant(
        genome=Genome(genome_id="parent", tools={"add": "def add(a, b): return 0"}),
        per_case=[PerCase(case_id="add#0", score=0.0, error="failed")],
    )

    child = Mutator(config, _task()).mutate_offspring([parent], [parent], 1)[0]

    assert "Fireworks unavailable (RuntimeError: 401 invalid API key <redacted>)" in child.lineage_note
    assert "fw_secret-value" not in child.lineage_note
