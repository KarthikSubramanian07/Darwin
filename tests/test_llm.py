"""Model-client factory: routes inference through the Braintrust gateway when enabled, so
Braintrust is core to the model race, not just to scoring."""

import sys
import types

import pytest

from darwin.config import load_config
from darwin.llm import ModelClient, describe_route, make_model_client


def test_resolve_model_gateway_vs_direct():
    full = "accounts/fireworks/models/llama-v3p1-8b-instruct"
    gw = ModelClient(client=None, route="gateway")
    direct = ModelClient(client=None, route="direct")
    assert gw.resolve_model(full) == "fireworks/llama-v3p1-8b-instruct"
    assert direct.resolve_model(full) == "accounts/fireworks/models/llama-v3p1-8b-instruct"


def test_describe_route_offline(monkeypatch):
    for var in ("BRAINTRUST_API_KEY", "FIREWORKS_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("USE_BRAINTRUST_GATEWAY", "0")
    assert "offline" in describe_route(load_config())


def test_describe_route_gateway(monkeypatch):
    monkeypatch.setenv("BRAINTRUST_API_KEY", "sk-test")
    monkeypatch.setenv("USE_BRAINTRUST_GATEWAY", "1")
    assert "gateway" in describe_route(load_config()).lower()


@pytest.fixture
def fake_openai(monkeypatch):
    captured = {}

    class _Client:
        def __init__(self, base_url=None, api_key=None):
            captured["base_url"] = base_url
            captured["api_key"] = api_key

    fake = types.ModuleType("openai")
    fake.OpenAI = _Client
    monkeypatch.setitem(sys.modules, "openai", fake)
    return captured


def test_gateway_route_when_enabled(fake_openai, monkeypatch):
    monkeypatch.setenv("BRAINTRUST_API_KEY", "sk-bt")
    monkeypatch.setenv("USE_BRAINTRUST_GATEWAY", "1")
    mc = make_model_client(load_config())
    assert mc.route == "gateway"
    assert fake_openai["base_url"] == "https://gateway.braintrust.dev/v1"
    assert fake_openai["api_key"] == "sk-bt"


def test_direct_route_when_gateway_off(fake_openai, monkeypatch):
    monkeypatch.setenv("BRAINTRUST_API_KEY", "sk-bt")
    monkeypatch.setenv("FIREWORKS_API_KEY", "fw-key")
    monkeypatch.setenv("USE_BRAINTRUST_GATEWAY", "0")
    mc = make_model_client(load_config())
    assert mc.route == "direct"
    assert "fireworks.ai" in fake_openai["base_url"]
    assert fake_openai["api_key"] == "fw-key"
