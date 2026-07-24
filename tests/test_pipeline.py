"""Lane A pipeline contract tests: reviewed offline data must always be runnable."""

from __future__ import annotations

import json
from types import SimpleNamespace

from darwin.eval.task import Task
from pipeline.decompose import industry_to_tasks
from pipeline.synth import _parse_fireworks_cases, generate_cases, write_task


def _offline_config():
    return SimpleNamespace(features=SimpleNamespace(fireworks=False), fireworks_api_key="")


def test_legal_decomposes_to_checked_tasks(tmp_path):
    tasks = industry_to_tasks("legal", _offline_config())

    assert len(tasks) == 5
    for task in tasks:
        completed = generate_cases(task, _offline_config())
        assert completed.industry == "legal"
        assert completed.total_cases == 10
        assert completed.problems[0].task_type == "structured"
        assert completed.problems[0].scorer_config["task_source"] == "canned"
        assert completed.problems[0].scorer_config["case_source"] == "canned"
        path = write_task(completed, tmp_path)
        loaded = Task.model_validate_json(path.read_text())
        assert loaded == completed


def test_support_decomposes_to_checked_tasks():
    tasks = industry_to_tasks("support", _offline_config())

    assert len(tasks) == 5
    completed = [generate_cases(task, _offline_config()) for task in tasks]
    assert all(task.total_cases == 10 for task in completed)
    assert all(task.problems[0].scorer_config["case_source"] == "canned" for task in completed)


def test_fireworks_case_payload_decodes_json_expected_values():
    payload = {
        "cases": [
            {"input": "example", "expected_json": json.dumps({"label": "value"})}
            for _ in range(8)
        ]
    }
    cases = _parse_fireworks_cases(json.dumps(payload))

    assert len(cases) == 8
    assert cases[0].args == ["example"]
    assert cases[0].expected == {"label": "value"}
