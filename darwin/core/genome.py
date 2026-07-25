"""Genome - the mutable definition of one agent variant. This is what evolves.

A genome materializes as a small agent package (system_prompt.txt + a tools/ dir of .py
files + params.json + manifest.json) so it can be dropped into a sandbox and run.

LANE A owns this file.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from darwin.safety.ids import require_tool_id

DEFAULT_SYSTEM_PROMPT = (
    "You are a coding agent. For each problem you are given, implement the requested function "
    "correctly. Your tools ARE your solutions; improve them until every hidden test passes."
)

# The default model gene. A Fireworks model id when the Fireworks path is on; a readable label
# offline. Evolution may swap this to any model in the catalog (see darwin/core/mutate.py).
# Verified live on serverless 2026-07-24 (legacy ids like llama-v3p1 were removed 2026-05-14;
# see DECISIONS.md D11 + darwin/core/fw_client.py RACE_MODELS).
DEFAULT_MODEL = "accounts/fireworks/models/gpt-oss-120b"


class Genome(BaseModel):
    """The mutable agent definition. The mutator may edit prompt, tools, and params, never the
    fitness code (see darwin/safety/guards.py)."""

    genome_id: str
    generation: int = 0
    parent_ids: list[str] = Field(default_factory=list)
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    tools: dict[str, str] = Field(default_factory=dict)  # problem_id -> Python source
    params: dict[str, float] = Field(default_factory=dict)  # e.g. temperature, max_steps
    model: str = DEFAULT_MODEL  # the model gene; evolution may swap it (see core/mutate.py)
    lineage_note: str = ""  # short "what changed vs parent", written by the mutator

    # ------------------------------------------------------------------ #
    # Construction
    # ------------------------------------------------------------------ #

    @classmethod
    def seed(cls, task, genome_id: str = "gen0-seed") -> Genome:  # noqa: ANN001
        """A generation-zero, deliberately-mediocre baseline: the first (broken) rung of each
        problem's ladder."""
        tools = {p.case_id: (p.ladder[0] if p.ladder else "") for p in task.problems}
        return cls(
            genome_id=genome_id,
            generation=0,
            tools=tools,
            params={"temperature": 0.7, "max_steps": 1.0},
            model=DEFAULT_MODEL,
            lineage_note="seed (generation zero)",
        )

    # ------------------------------------------------------------------ #
    # Materialization (drop into a sandbox)
    # ------------------------------------------------------------------ #

    def to_files(self, directory: str | Path) -> Path:
        """Write this genome as an agent package under `directory` and return the path."""
        root = Path(directory)
        tools_dir = root / "tools"
        tools_dir.mkdir(parents=True, exist_ok=True)
        (root / "system_prompt.txt").write_text(self.system_prompt)
        (root / "params.json").write_text(json.dumps(self.params, indent=2))
        (root / "meta.json").write_text(json.dumps({"model": self.model}, indent=2))
        manifest = {}
        for problem_id, source in self.tools.items():
            safe_id = require_tool_id(problem_id)
            (tools_dir / f"{safe_id}.py").write_text(source)
            manifest[safe_id] = f"tools/{safe_id}.py"
        (root / "manifest.json").write_text(json.dumps(manifest, indent=2))
        return root

    @classmethod
    def from_files(cls, directory: str | Path, genome_id: str = "loaded") -> Genome:
        root = Path(directory)
        manifest = json.loads((root / "manifest.json").read_text())
        tools = {pid: (root / rel).read_text() for pid, rel in manifest.items()}
        params = json.loads((root / "params.json").read_text())
        meta_path = root / "meta.json"
        model = json.loads(meta_path.read_text()).get("model", DEFAULT_MODEL) if meta_path.exists() else DEFAULT_MODEL
        return cls(
            genome_id=genome_id,
            system_prompt=(root / "system_prompt.txt").read_text(),
            tools=tools,
            params=params,
            model=model,
        )

    # ------------------------------------------------------------------ #
    # Serialization
    # ------------------------------------------------------------------ #

    def clone(self, **overrides) -> Genome:
        return self.model_copy(deep=True, update=overrides)

    def to_json(self) -> str:
        return self.model_dump_json(indent=2)

    @classmethod
    def from_json(cls, blob: str) -> Genome:
        return cls.model_validate(json.loads(blob))
