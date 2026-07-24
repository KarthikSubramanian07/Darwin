"""Live bridge: /ws streams engine events end-to-end, /api/run drives a real (offline) run.

Uses a tiny offline configuration so the full engine run completes in a couple of seconds.
No network, no sponsor keys - this is the CI-safe proof that the UI plumbing works.
"""

from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def offline_env(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS"):
        monkeypatch.setenv(var, "0")
    monkeypatch.setenv("POPULATION_SIZE", "4")
    monkeypatch.setenv("GENERATIONS", "2")


@pytest.fixture
def client(offline_env):
    # import inside the fixture so the module-level channel starts fresh per test session
    import importlib

    import darwin.server.app as app_module

    importlib.reload(app_module)
    return TestClient(app_module.app), app_module


def test_status_starts_idle(client):
    tc, _ = client
    body = tc.get("/api/status").json()
    assert body["running"] is False


def test_unknown_task_is_a_400(client):
    tc, _ = client
    assert tc.post("/api/run", json={"task": "nope", "offline": True}).status_code == 400


def test_run_streams_events_over_ws(client):
    tc, app_module = client
    with tc.websocket_connect("/ws") as ws:
        res = tc.post("/api/run", json={"task": "coding_bench", "offline": True})
        assert res.status_code == 200

        types = []
        deadline = time.time() + 60
        while time.time() < deadline:
            event = ws.receive_json()
            types.append(event["type"])
            if event["type"] in ("run_complete", "run_failed"):
                break
        assert "run_started" in types
        assert "variant_evaluated" in types
        assert "generation_complete" in types
        assert types[-1] == "run_complete", types[-10:]

    # second client gets the finished run as a replayed snapshot (late-joiner path)
    with tc.websocket_connect("/ws") as ws2:
        first = ws2.receive_json()
        assert first.get("replay") is True
        assert first["type"] == "run_started"


def test_second_run_while_active_is_a_409(client):
    tc, app_module = client
    # simulate an active run without spawning a thread
    app_module._run_state["running"] = True
    try:
        assert tc.post("/api/run", json={"task": "coding_bench"}).status_code == 409
    finally:
        app_module._run_state["running"] = False


def test_offline_run_never_mutates_process_env(client, monkeypatch):
    """Regression: an offline=true run used to do os.environ["FEATURE_X"] = "0" with nothing
    ever setting it back - in the long-lived server process that permanently downgraded every
    later run (including ones the dashboard sends with offline=false) to the local/canned path.
    The override must live on the per-run Config object only.
    """
    tc, app_module = client
    monkeypatch.setenv("FEATURE_FIREWORKS", "1")  # distinct from the class-wide offline_env=0
    assert os.environ["FEATURE_FIREWORKS"] == "1"

    app_module._run_engine("coding_bench", True)  # synchronous call, offline=True

    assert os.environ["FEATURE_FIREWORKS"] == "1", "offline run leaked into the process env"
