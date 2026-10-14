"""Data-root resolution: clones keep data/, installed copies use ~/.darwin, tasks ship bundled."""

from pathlib import Path

import pytest

import darwin.eval.task as task_mod
from darwin import paths
from darwin.eval.task import Task

REPO = Path(__file__).resolve().parents[1]


def test_clone_uses_repo_data(monkeypatch):
    monkeypatch.delenv("DARWIN_DATA_DIR", raising=False)
    assert paths.data_root() == REPO / "data"


def test_env_override_wins(monkeypatch, tmp_path):
    monkeypatch.setenv("DARWIN_DATA_DIR", str(tmp_path))
    assert paths.data_root() == tmp_path


def test_installed_copy_falls_back_to_home(monkeypatch, tmp_path):
    monkeypatch.delenv("DARWIN_DATA_DIR", raising=False)
    monkeypatch.setattr(paths, "_REPO_DATA", tmp_path / "missing")
    monkeypatch.setenv("HOME", str(tmp_path))
    assert paths.data_root() == tmp_path / ".darwin"


def test_task_falls_back_to_bundled_copy(monkeypatch, tmp_path):
    bundled = tmp_path / "bundled"
    bundled.mkdir()
    (bundled / "coding_bench.json").write_text((REPO / "data/task/coding_bench.json").read_text())
    monkeypatch.setattr(task_mod, "DATA_DIR", tmp_path / "empty")
    monkeypatch.setattr(task_mod, "BUNDLED_TASK_DIR", bundled)
    assert Task.load("coding_bench").task_id == "coding_bench"


def test_user_task_shadows_bundled(monkeypatch, tmp_path):
    user, bundled = tmp_path / "user", tmp_path / "bundled"
    user.mkdir()
    bundled.mkdir()
    (user / "mine.json").write_text('{"task_id": "mine", "description": "user"}')
    (bundled / "mine.json").write_text('{"task_id": "mine", "description": "bundled"}')
    monkeypatch.setattr(task_mod, "DATA_DIR", user)
    monkeypatch.setattr(task_mod, "BUNDLED_TASK_DIR", bundled)
    assert Task.load("mine").description == "user"


def test_missing_task_is_a_clear_error(monkeypatch, tmp_path):
    monkeypatch.setattr(task_mod, "DATA_DIR", tmp_path)
    monkeypatch.setattr(task_mod, "BUNDLED_TASK_DIR", tmp_path)
    with pytest.raises(FileNotFoundError, match="nope.json"):
        Task.load("nope")
