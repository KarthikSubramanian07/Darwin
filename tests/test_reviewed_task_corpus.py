"""The reviewed Fireworks task corpus must remain runnable under the frozen Task contract."""

from __future__ import annotations

from darwin.eval.task import Task

TASK_IDS = (
    "legal_clause_type",
    "legal_confidentiality",
    "legal_governing_law",
    "legal_payment_terms",
    "legal_renewal",
    "support_intent",
    "support_order_status",
    "support_priority",
    "support_refund_policy",
    "support_sentiment",
)


def test_reviewed_fireworks_tasks_load_with_ten_cases_each():
    tasks = [Task.load(task_id) for task_id in TASK_IDS]

    assert all(task.total_cases == 10 for task in tasks)
    assert all(task.problems[0].task_type == "structured" for task in tasks)
    assert all(task.problems[0].scorer_config["task_source"] == "fireworks" for task in tasks)
    assert all(task.problems[0].scorer_config["case_source"] == "fireworks" for task in tasks)
