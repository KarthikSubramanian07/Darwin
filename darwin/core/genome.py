"""Genome — the mutable definition of one agent variant. This is what evolves.

A genome materializes as a small agent package (system_prompt.txt + a tools/ dir of .py
files + params.json) so it can be dropped into a sandbox and run.

LANE A owns this file.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field


class Genome(BaseModel):
    """The mutable agent definition. The mutator may edit prompt, tools, and params —
    never the fitness code (see darwin/safety/guards.py)."""

    genome_id: str
    generation: int = 0
    parent_ids: list[str] = Field(default_factory=list)
    system_prompt: str = ""
    tools: dict[str, str] = Field(default_factory=dict)  # tool_name -> Python source
    params: dict[str, float] = Field(default_factory=dict)  # e.g. temperature, max_steps
    lineage_note: str = ""  # short "what changed vs parent", written by the mutator

    # ------------------------------------------------------------------ #
    # TODO(Lane A): implement.
    # ------------------------------------------------------------------ #

    @classmethod
    def seed(cls, task) -> Genome:  # noqa: ANN001
        """Return a generation-zero, deliberately-mediocre baseline agent for `task`."""
        raise NotImplementedError

    def to_files(self, directory: str | Path) -> Path:
        """Materialize this genome as an agent package under `directory`."""
        raise NotImplementedError

    @classmethod
    def from_files(cls, directory: str | Path) -> Genome:
        """Load a genome from a materialized agent package."""
        raise NotImplementedError

    def to_json(self) -> str:
        return self.model_dump_json(indent=2)

    @classmethod
    def from_json(cls, blob: str) -> Genome:
        return cls.model_validate(json.loads(blob))
