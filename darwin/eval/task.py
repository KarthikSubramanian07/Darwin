"""The target task: dataset + expected outputs (the thing being solved). LANE C owns this.

Darwin's benchmark is a suite of small Python coding problems (see scripts/build_task.py).
The genome's tool code is the candidate solution for each problem; fitness is the fraction of
hidden cases it passes. `expected` values live here on the grader side and are never handed to
a genome or placed in a sandbox, which preserves the immutable-grader property.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "task"


class Case(BaseModel):
    args: list  # positional args passed to the entrypoint
    expected: object  # the grader-side answer (never enters a sandbox)


class Problem(BaseModel):
    case_id: str
    entrypoint: str
    prompt: str = ""
    cases: list[Case] = Field(default_factory=list)
    ladder: list[str] = Field(default_factory=list)  # offline-only: broken -> correct sources
    task_type: str = "code"  # "code" | "text" | "structured" (drives scorer choice)
    scorer_config: dict = Field(default_factory=dict)  # per-type scorer knobs (Lane C)


class Task(BaseModel):
    task_id: str
    description: str = ""
    industry: str = ""  # set when the task came from pipeline.decompose
    problems: list[Problem] = Field(default_factory=list)

    @classmethod
    def load(cls, task_id: str = "coding_bench") -> Task:
        path = DATA_DIR / f"{task_id}.json"
        if not path.exists():
            raise FileNotFoundError(
                f"Task dataset {path} not found. Run: python scripts/build_task.py"
            )
        return cls.model_validate(json.loads(path.read_text()))

    @property
    def total_cases(self) -> int:
        return sum(len(p.cases) for p in self.problems)

    def inputs_only(self) -> dict:
        """The sandbox-safe view: entrypoints + argument lists, no expected answers.

        Shape: {problem_id: {"entrypoint": str, "cases": [[args...], ...]}}
        """
        return {
            p.case_id: {"entrypoint": p.entrypoint, "cases": [c.args for c in p.cases]}
            for p in self.problems
        }

    def expected(self) -> dict:
        """Grader-side answers: {problem_id: [expected0, expected1, ...]}. Host-only."""
        return {p.case_id: [c.expected for c in p.cases] for p in self.problems}
