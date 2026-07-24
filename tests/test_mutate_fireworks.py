"""Fireworks mutation path: strict validation, canned fallback, model swap, canary (Lane C)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from darwin.config import load_config
from darwin.core.fw_client import CallStats
from darwin.core.mutate import Mutator
from darwin.core.population import PerCase, Variant
from darwin.eval.task import Task

CATALOG = [
    "accounts/fireworks/models/gpt-oss-120b",
    "accounts/fireworks/models/kimi-k2p6",
]


class _FakeFW:
    """Stands in for FireworksClient: returns a scripted tool call."""

    def __init__(self, arguments: dict | str | None, *, raise_error: bool = False):
        self.enabled = True
        self.arguments = arguments
        self.raise_error = raise_error
        self.calls = 0

    def catalog(self):
        return list(CATALOG)

    def chat(self, **kwargs):
        self.calls += 1
        if self.raise_error:
            raise RuntimeError("boom")
        if self.arguments is None:
            message = SimpleNamespace(tool_calls=None)
        else:
            blob = (
                self.arguments
                if isinstance(self.arguments, str)
                else json.dumps(self.arguments)
            )
            message = SimpleNamespace(
                tool_calls=[SimpleNamespace(function=SimpleNamespace(arguments=blob))]
            )
        resp = SimpleNamespace(choices=[SimpleNamespace(message=message)])
        return resp, CallStats(latency_ms=42, tokens_in=10, tokens_out=5, cost_est=0.001)


@pytest.fixture
def task():
    return Task.load("coding_bench")


@pytest.fixture
def offline_env(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS", "FEATURE_CODERABBIT"):
        monkeypatch.setenv(var, "0")


def _parent(task, mutator_cfg=None) -> Variant:
    from darwin.core.genome import Genome

    genome = Genome.seed(task, genome_id="p0")
    per_case = [
        PerCase(case_id=f"{p.case_id}#0", score=0.0, error="expected 4, got 5")
        for p in task.problems[:2]
    ]
    return Variant(genome=genome, fitness=0.4, per_case=per_case)


def _mutator(task, fake_fw, monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return Mutator(load_config(), task, fw=fake_fw)


# --------------------------------------------------------------------- #
# Offline path stays exactly as before
# --------------------------------------------------------------------- #


def test_offline_mutator_has_no_race_models(offline_env, task):
    m = Mutator(load_config(), task)
    assert m.use_fireworks is False
    assert m.race_models == []


def test_offline_children_come_from_the_ladder(offline_env, task):
    m = Mutator(load_config(), task)
    children = m.mutate_offspring([_parent(task)], [], 3, generation=1)
    assert len(children) == 3
    assert all(c.parent_ids == ["p0"] for c in children)


# --------------------------------------------------------------------- #
# Fireworks path: validation + fallback
# --------------------------------------------------------------------- #


def test_tool_rewrite_applies_valid_source(monkeypatch, task):
    problem = task.problems[0]
    fw = _FakeFW(
        {
            "target": f"tool:{problem.case_id}",
            "new_content": f"def {problem.entrypoint}(*a):\n    return 42\n",
            "lineage_note": "fixed",
        }
    )
    m = _mutator(task, fw, monkeypatch)
    child = m.mutate_offspring([_parent(task)], [], 1, generation=1)[0]
    assert "return 42" in child.tools[problem.case_id]
    assert m.call_stats[child.genome_id]["latency_ms"] == 42


def test_model_swap_only_from_catalog(monkeypatch, task):
    fw = _FakeFW({"target": "model", "new_content": CATALOG[1], "lineage_note": "swap"})
    m = _mutator(task, fw, monkeypatch)
    child = m.mutate_offspring([_parent(task)], [], 1, generation=2)[0]
    assert child.model == CATALOG[1]
    assert "model swap" in child.lineage_note


def test_model_swap_rejects_unknown_model_falls_back(monkeypatch, task):
    fw = _FakeFW({"target": "model", "new_content": "accounts/evil/models/x", "lineage_note": ""})
    m = _mutator(task, fw, monkeypatch)
    child = m.mutate_offspring([_parent(task)], [], 1, generation=1)[0]
    # fell back to the canned ladder child: model unchanged
    assert child.model == _parent(task).genome.model
    assert child.genome_id not in m.call_stats


def test_grader_token_in_tool_source_falls_back(monkeypatch, task):
    problem = task.problems[0]
    fw = _FakeFW(
        {
            "target": f"tool:{problem.case_id}",
            "new_content": "import darwin.eval.fitness\n",
            "lineage_note": "sneaky",
        }
    )
    m = _mutator(task, fw, monkeypatch)
    child = m.mutate_offspring([_parent(task)], [], 1, generation=1)[0]
    assert "darwin.eval.fitness" not in child.tools.get(problem.case_id, "")


def test_syntax_error_source_falls_back(monkeypatch, task):
    problem = task.problems[0]
    fw = _FakeFW(
        {"target": f"tool:{problem.case_id}", "new_content": "def broken(:", "lineage_note": ""}
    )
    m = _mutator(task, fw, monkeypatch)
    child = m.mutate_offspring([_parent(task)], [], 1, generation=1)[0]
    assert child.tools[problem.case_id] != "def broken(:"


def test_malformed_arguments_fall_back(monkeypatch, task):
    fw = _FakeFW("this is not json{")
    m = _mutator(task, fw, monkeypatch)
    children = m.mutate_offspring([_parent(task)], [], 2, generation=1)
    assert len(children) == 2  # canned fallback still produced offspring


def test_api_error_falls_back(monkeypatch, task):
    fw = _FakeFW(None, raise_error=True)
    m = _mutator(task, fw, monkeypatch)
    children = m.mutate_offspring([_parent(task)], [], 2, generation=1)
    assert len(children) == 2


def test_params_target_merges_floats(monkeypatch, task):
    fw = _FakeFW(
        {"target": "params", "new_content": '{"temperature": 0.1}', "lineage_note": "cooler"}
    )
    m = _mutator(task, fw, monkeypatch)
    child = m.mutate_offspring([_parent(task)], [], 1, generation=1)[0]
    assert child.params["temperature"] == pytest.approx(0.1)


# --------------------------------------------------------------------- #
# Seeded regression canary (the rollback demo beat)
# --------------------------------------------------------------------- #


def test_canary_child_seeded_at_configured_generation(offline_env, monkeypatch, task):
    monkeypatch.setenv("SEED_REGRESSION_GEN", "2")
    m = Mutator(load_config(), task)
    children = m.mutate_offspring([_parent(task)], [], 2, generation=2)
    assert "canary" in children[0].genome_id
    assert "SEEDED regression canary" in children[0].lineage_note
    # the canary's sabotaged tool must actually regress (raises at runtime)
    assert any("raise RuntimeError" in src for src in children[0].tools.values())
    # other offspring in the same generation are normal
    assert "canary" not in children[1].genome_id


def test_no_canary_by_default(offline_env, task):
    m = Mutator(load_config(), task)
    children = m.mutate_offspring([_parent(task)], [], 2, generation=2)
    assert all("canary" not in c.genome_id for c in children)
