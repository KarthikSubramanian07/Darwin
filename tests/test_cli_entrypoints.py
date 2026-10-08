"""The `darwin` and `darwin-server` console scripts advertised on /developers must resolve."""

import importlib
import tomllib
from pathlib import Path

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def _scripts() -> dict[str, str]:
    return tomllib.loads(PYPROJECT.read_text())["project"]["scripts"]


def test_cli_scripts_declared():
    assert set(_scripts()) == {"darwin", "darwin-server"}


def test_cli_scripts_resolve_to_callables():
    for target in _scripts().values():
        module, func = target.split(":")
        assert callable(getattr(importlib.import_module(module), func))


def test_darwin_cli_help(capsys, monkeypatch):
    from darwin.main import main

    monkeypatch.setattr("sys.argv", ["darwin", "--help"])
    try:
        main()
    except SystemExit as e:
        assert e.code == 0
    out = capsys.readouterr().out
    assert "--offline" in out and "--task" in out
