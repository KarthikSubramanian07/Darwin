"""The target task: dataset + expected outputs (the thing being solved). LANE C owns this.

Darwin's benchmark is a suite of small Python coding problems (see scripts/build_task.py).
The genome's tool code is the candidate solution for each problem; fitness is the fraction of
hidden cases it passes. `expected` values live here on the grader side and are never handed to
a genome or placed in a sandbox, which preserves the immutable-grader property.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field, field_validator

from darwin.paths import BUNDLED_TASK_DIR, data_root
from darwin.safety.ids import require_slug, require_tool_id

DATA_DIR = data_root() / "task"


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

    @field_validator("case_id")
    @classmethod
    def _case_id_slug(cls, value: str) -> str:
        return require_tool_id(value)


class Task(BaseModel):
    task_id: str
    description: str = ""
    industry: str = ""  # set when the task came from pipeline.decompose
    problems: list[Problem] = Field(default_factory=list)

    @field_validator("task_id")
    @classmethod
    def _task_id_slug(cls, value: str) -> str:
        return require_slug(value, what="task_id")

    @classmethod
    def load(cls, task_id: str = "coding_bench") -> Task:
        safe_id = require_slug(task_id, what="task_id")
        # User/clone tasks win; the copies bundled in the wheel are the fallback.
        for base in (DATA_DIR, BUNDLED_TASK_DIR):
            path = (base / f"{safe_id}.json").resolve()
            if not path.is_relative_to(base.resolve()):
                raise ValueError(f"task path escaped data dir: {task_id!r}")
            if path.exists():
                break
        else:
            raise FileNotFoundError(
                f"Task dataset {safe_id}.json not found in {DATA_DIR}. "
                "Run: python scripts/build_task.py"
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
