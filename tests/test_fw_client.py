"""FireworksClient: flag-off no-op, cost math, retry/backoff, catalog fallback (Lane C)."""

from __future__ import annotations

import pytest

from darwin.config import load_config
from darwin.core.fw_client import (
    MODEL_PRICES,
    RACE_MODELS,
    FireworksClient,
    estimate_cost,
)


@pytest.fixture
def offline_config(monkeypatch):
    monkeypatch.setenv("FEATURE_FIREWORKS", "0")
    return load_config()


@pytest.fixture
def flagged_config(monkeypatch):
    monkeypatch.setenv("FEATURE_FIREWORKS", "1")
    monkeypatch.setenv("FIREWORKS_API_KEY", "fw_test_key")
    return load_config()


def test_disabled_without_flag(offline_config):
    client = FireworksClient(offline_config)
    assert client.enabled is False
    with pytest.raises(RuntimeError):
        client.chat(model="m", messages=[])


def test_disabled_without_key(monkeypatch):
    monkeypatch.setenv("FEATURE_FIREWORKS", "1")
    monkeypatch.setenv("FIREWORKS_API_KEY", "")
    client = FireworksClient(load_config())
    assert client.enabled is False


def test_catalog_fallback_is_pinned_when_disabled(offline_config):
    assert FireworksClient(offline_config).catalog() == list(RACE_MODELS)


def test_every_race_model_is_priced():
    for model in RACE_MODELS:
        assert model in MODEL_PRICES


def test_estimate_cost_math():
    # gpt-oss-120b: $0.15/M in, $0.60/M out (fireworks.ai/models, 2026-07-24)
    cost = estimate_cost("accounts/fireworks/models/gpt-oss-120b", 1_000_000, 1_000_000)
    assert cost == pytest.approx(0.75)
    assert estimate_cost("unknown/model", 0, 0) == 0.0


class _Boom(Exception):
    def __init__(self, status_code):
        self.status_code = status_code


class _FlakySDK:
    """Fails with 429 `fail_times` times, then succeeds."""

    def __init__(self, fail_times: int):
        self.calls = 0
        self.fail_times = fail_times
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise _Boom(429)
        from types import SimpleNamespace

        return SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=100, completion_tokens=50),
            choices=[],
        )


def test_retry_backoff_recovers_from_429(flagged_config, monkeypatch):
    client = FireworksClient(flagged_config, max_retries=3)
    sdk = _FlakySDK(fail_times=2)
    monkeypatch.setattr(client, "_sdk", lambda: sdk)
    monkeypatch.setattr("darwin.core.fw_client.time.sleep", lambda _s: None)
    resp, stats = client.chat(model="accounts/fireworks/models/gpt-oss-120b", messages=[])
    assert sdk.calls == 3
    assert stats.tokens_in == 100 and stats.tokens_out == 50
    assert stats.cost_est == pytest.approx(estimate_cost(
        "accounts/fireworks/models/gpt-oss-120b", 100, 50
    ))


def test_retry_gives_up_after_max_retries(flagged_config, monkeypatch):
    client = FireworksClient(flagged_config, max_retries=2)
    sdk = _FlakySDK(fail_times=99)
    monkeypatch.setattr(client, "_sdk", lambda: sdk)
    monkeypatch.setattr("darwin.core.fw_client.time.sleep", lambda _s: None)
    with pytest.raises(_Boom):
        client.chat(model="m", messages=[])
    assert sdk.calls == 3  # initial + 2 retries


def test_non_retryable_errors_raise_immediately(flagged_config, monkeypatch):
    client = FireworksClient(flagged_config, max_retries=3)

    class _SDK400(_FlakySDK):
        def create(self, **kwargs):
            self.calls += 1
            raise _Boom(400)

    sdk = _SDK400(fail_times=0)
    monkeypatch.setattr(client, "_sdk", lambda: sdk)
    with pytest.raises(_Boom):
        client.chat(model="m", messages=[])
    assert sdk.calls == 1
