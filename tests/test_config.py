"""Config + feature-flag smoke tests. Green from day one."""

from darwin.config import Features, load_config


def test_config_loads_with_defaults(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS"):
        monkeypatch.delenv(var, raising=False)
    cfg = load_config()
    assert cfg.population_size > 0
    assert cfg.generations > 0
    assert cfg.elite_k >= 1
    assert isinstance(cfg.features, Features)


def test_feature_flags_toggle_off(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS"):
        monkeypatch.setenv(var, "0")
    cfg = load_config()
    assert not cfg.features.daytona
    assert not cfg.features.braintrust
    assert not cfg.features.fireworks


def test_elite_k_not_larger_than_population():
    cfg = load_config()
    assert cfg.elite_k <= cfg.population_size
