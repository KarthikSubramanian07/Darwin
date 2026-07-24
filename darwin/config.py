"""Central config: env, feature flags, and demo-tuned run parameters.

Every sponsor integration is independently disableable. With all three FEATURES off,
Darwin runs fully offline (local sandbox + local scorer + canned mutations) and the
fitness curve must still climb. That flag-off path is the demo floor.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: str = "1") -> bool:
    return os.getenv(name, default).strip() not in ("0", "false", "False", "")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Features:
    daytona: bool = field(default_factory=lambda: _flag("FEATURE_DAYTONA"))
    braintrust: bool = field(default_factory=lambda: _flag("FEATURE_BRAINTRUST"))
    fireworks: bool = field(default_factory=lambda: _flag("FEATURE_FIREWORKS"))
    coderabbit: bool = field(default_factory=lambda: _flag("FEATURE_CODERABBIT"))


@dataclass(frozen=True)
class Config:
    # --- secrets ---
    daytona_api_key: str = field(default_factory=lambda: os.getenv("DAYTONA_API_KEY", ""))
    braintrust_api_key: str = field(default_factory=lambda: os.getenv("BRAINTRUST_API_KEY", ""))
    fireworks_api_key: str = field(default_factory=lambda: os.getenv("FIREWORKS_API_KEY", ""))
    fireworks_base_url: str = field(
        default_factory=lambda: os.getenv(
            "FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1"
        )
    )
    coderabbit_api_key: str = field(default_factory=lambda: os.getenv("CODERABBIT_API_KEY", ""))
    github_repo: str = field(default_factory=lambda: os.getenv("GITHUB_REPO", ""))

    # --- feature flags ---
    features: Features = field(default_factory=Features)

    # --- run params (demo-tuned defaults) ---
    population_size: int = field(default_factory=lambda: _int("POPULATION_SIZE", 8))
    generations: int = field(default_factory=lambda: _int("GENERATIONS", 6))
    elite_k: int = field(default_factory=lambda: _int("ELITE_K", 2))
    max_total_sandboxes: int = field(default_factory=lambda: _int("MAX_TOTAL_SANDBOXES", 48))
    max_wall_clock_s: int = field(default_factory=lambda: _int("MAX_WALL_CLOCK_S", 180))
    random_seed: int = field(default_factory=lambda: _int("RANDOM_SEED", 1337))
    auto_approve: bool = field(default_factory=lambda: _flag("AUTO_APPROVE"))
    # demo: generation index at which one deliberately-regressing canary child is seeded so the
    # auto-reject + rollback beat happens on stage (SPEC section 7). -1 = off.
    seed_regression_gen: int = field(default_factory=lambda: _int("SEED_REGRESSION_GEN", -1))


def load_config() -> Config:
    """Build a Config from the current environment."""
    return Config()
