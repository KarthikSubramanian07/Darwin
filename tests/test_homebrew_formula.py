"""The Homebrew formula in Formula/ must track the package version it installs."""

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_formula_pins_the_current_release():
    version = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["version"]
    formula = (ROOT / "Formula" / "trydarwin.rb").read_text()
    assert f"/releases/download/v{version}/trydarwin-{version}.tar.gz" in formula
    assert re.search(r'sha256 "[0-9a-f]{64}"', formula)
