"""Where Darwin reads tasks and writes run records, in a git clone or an installed copy.

Resolution order for the data root:
  1. $DARWIN_DATA_DIR, when set
  2. <repo>/data, when running from a clone (the original layout; nothing changes there)
  3. ~/.darwin, for a pip/pipx/Homebrew install

Built-in tasks also ship inside the wheel (darwin/_data/task), so `darwin --offline` works
straight after `pipx install trydarwin` with no clone and no build step.
"""

from __future__ import annotations

import os
from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent
_REPO_DATA = _PACKAGE_DIR.parent / "data"
BUNDLED_TASK_DIR = _PACKAGE_DIR / "_data" / "task"


def data_root() -> Path:
    override = os.environ.get("DARWIN_DATA_DIR")
    if override:
        return Path(override).expanduser()
    if (_REPO_DATA / "task").is_dir():
        return _REPO_DATA
    return Path.home() / ".darwin"
