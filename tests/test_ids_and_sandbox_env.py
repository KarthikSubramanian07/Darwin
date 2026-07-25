"""Tests for slug/path validation and local-sandbox env scrubbing."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from darwin.core.genome import Genome
from darwin.eval.task import Task
from darwin.safety.ids import require_slug, require_tool_id
from darwin.sandbox.local import LocalSandboxPool, _sandbox_env


def test_require_slug_rejects_traversal():
    with pytest.raises(ValueError):
        require_slug("../runs/secret", what="task_id")
    with pytest.raises(ValueError):
        require_tool_id("../../tmp/pwned")


def test_task_load_rejects_traversal():
    with pytest.raises(ValueError):
        Task.load("../runs/sample_run-1337-1784920520")


def test_genome_to_files_rejects_bad_tool_id(tmp_path: Path):
    g = Genome(genome_id="bad", tools={"../../evil": "def f():\n    return 1\n"})
    with pytest.raises(ValueError):
        g.to_files(tmp_path)


def test_sandbox_env_strips_secrets(monkeypatch):
    monkeypatch.setenv("DAYTONA_API_KEY", "secret-daytona")
    monkeypatch.setenv("BRAINTRUST_API_KEY", "secret-bt")
    monkeypatch.setenv("FIREWORKS_API_KEY", "secret-fw")
    monkeypatch.setenv("DARWIN_API_TOKEN", "secret-token")
    monkeypatch.setenv("PATH", os.environ.get("PATH", "/usr/bin"))
    env = _sandbox_env()
    assert "DAYTONA_API_KEY" not in env
    assert "BRAINTRUST_API_KEY" not in env
    assert "FIREWORKS_API_KEY" not in env
    assert "DARWIN_API_TOKEN" not in env
    assert "PATH" in env


def test_local_pool_constructs():
    pool = LocalSandboxPool()
    try:
        handles = pool.acquire(1)
        assert handles[0].sandbox_id.startswith("local-")
    finally:
        pool.close()
