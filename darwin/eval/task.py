"""The target task: dataset + expected outputs (the thing being solved). LANE C owns this.

Pick a task where improvement is near-deterministic from STRUCTURED, ACTIONABLE feedback,
so the mutator can act on failure traces and the climb is reliable. Keep the dataset small
enough to score a whole population fast.

Final task choice is recorded in DECISIONS.md (D4).
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "task"


class EvalCase(BaseModel):
    case_id: str
    input: object
    expected: object


class Task(BaseModel):
    task_id: str
    description: str = ""
    cases: list[EvalCase] = []

    @classmethod
    def load(cls, task_id: str = "default") -> Task:
        """Load the task dataset from data/task/. TODO(Lane C)."""
        raise NotImplementedError
