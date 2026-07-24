"""Rollback plumbing: handle_by_id + regression -> rolled_back with workdir restored (Lane C).

Regression guard for a real bug: guards._rollback looks handles up via pool.handle_by_id,
which LocalSandboxPool used to lack - so rollback silently no-opped even offline.
"""

from __future__ import annotations

import pytest

from darwin.config import load_config
from darwin.core.genome import Genome
from darwin.core.population import Variant
from darwin.safety.guards import Guards
from darwin.sandbox.local import LocalSandboxPool


@pytest.fixture
def offline_env(monkeypatch):
    for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS"):
        monkeypatch.setenv(var, "0")


def test_handle_by_id_finds_live_handles(offline_env):
    pool = LocalSandboxPool()
    try:
        h1, h2 = pool.acquire(2)
        assert pool.handle_by_id(h1.sandbox_id) is h1
        assert pool.handle_by_id(h2.sandbox_id) is h2
        assert pool.handle_by_id("nope") is None
    finally:
        pool.close()


def test_regression_is_rejected_and_rolled_back(offline_env):
    pool = LocalSandboxPool()
    try:
        (handle,) = pool.acquire(1)
        marker = handle.workdir / "state.txt"
        marker.write_text("parent-state")
        snap_id = pool.snapshot(handle)
        marker.write_text("mutated-state")  # the bad mutation's residue

        genome = Genome(genome_id="child", parent_ids=["parent"])
        regressed = Variant(
            genome=genome,
            fitness=0.2,
            sandbox_id=handle.sandbox_id,
            snapshot_id=snap_id,
            status="evaluated",
        )
        guards = Guards(load_config(), sandboxes=pool)
        guards.filter([regressed], parent_fitness={"parent": 0.8})

        assert regressed.status == "rolled_back"  # rejected, then restore succeeded
        assert marker.read_text() == "parent-state"  # sandbox state actually rolled back
    finally:
        pool.close()


def test_non_regression_untouched(offline_env):
    pool = LocalSandboxPool()
    try:
        (handle,) = pool.acquire(1)
        genome = Genome(genome_id="child", parent_ids=["parent"])
        improved = Variant(
            genome=genome, fitness=0.9, sandbox_id=handle.sandbox_id, status="evaluated"
        )
        guards = Guards(load_config(), sandboxes=pool)
        guards.filter([improved], parent_fitness={"parent": 0.8})
        assert improved.status == "evaluated"
    finally:
        pool.close()
