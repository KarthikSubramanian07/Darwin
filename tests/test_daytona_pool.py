"""DaytonaSandboxPool: offline-safe surface tests + optional live smoke (Lane C).

CI runs with all sponsor flags off and no keys: everything here must pass without the
network. The live class at the bottom only runs when FEATURE_DAYTONA=1 and a key is set.
"""

from __future__ import annotations

import io
import json
import os
import tarfile

import pytest

from darwin.core.genome import Genome
from darwin.eval.task import Task
from darwin.sandbox.base import SandboxPool
from darwin.sandbox.daytona import DaytonaSandboxPool


def test_claims_real_isolation():
    assert DaytonaSandboxPool.is_real_isolation is True


def test_satisfies_the_pool_protocol():
    # issubclass() is not allowed on protocols with data members; check the surface directly
    for method in ("acquire", "run_genome", "snapshot", "restore", "close", "handle_by_id"):
        assert callable(getattr(DaytonaSandboxPool, method)), method
    assert isinstance(SandboxPool, type(SandboxPool))  # protocol import stays load-bearing


def test_refuses_to_start_without_key(monkeypatch):
    monkeypatch.setenv("DAYTONA_API_KEY", "")
    from darwin.config import load_config

    with pytest.raises(RuntimeError, match="DAYTONA_API_KEY"):
        DaytonaSandboxPool(load_config())


def test_build_package_contains_genome_inputs_and_harness():
    task = Task.load("coding_bench")
    genome = Genome.seed(task, genome_id="pkg-test")
    blob = DaytonaSandboxPool._build_package(genome, task.inputs_only())
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        names = set(tar.getnames())
        assert {"harness.py", "inputs.json", "system_prompt.txt", "manifest.json"} <= names
        inputs = json.loads(tar.extractfile("inputs.json").read())
    # immutable-grader property: expected answers never enter the sandbox package
    assert "expected" not in json.dumps(inputs)


def test_all_errors_mirrors_local_pool_shape():
    task = Task.load("coding_bench")
    spec = task.inputs_only()
    outputs = DaytonaSandboxPool._all_errors(spec, "sandbox exec failed: test")
    assert set(outputs) == set(spec)
    for pid, info in spec.items():
        assert len(outputs[pid]) == len(info["cases"])
        assert all(o["got"] is None and "test" in o["error"] for o in outputs[pid])


# --------------------------------------------------------------------- #
# Live smoke (needs FEATURE_DAYTONA=1 + DAYTONA_API_KEY; excluded from offline CI)
# --------------------------------------------------------------------- #

_LIVE = os.getenv("FEATURE_DAYTONA", "0") not in ("0", "false", "False", "") and bool(
    os.getenv("DAYTONA_API_KEY")
)


@pytest.mark.skipif(not _LIVE, reason="live Daytona smoke needs FEATURE_DAYTONA=1 + key")
def test_live_run_genome_snapshot_restore_roundtrip():
    from darwin.config import load_config

    task = Task.load("coding_bench")
    pool = DaytonaSandboxPool(load_config())
    try:
        (handle,) = pool.acquire(1)
        genome = Genome.seed(task, genome_id="live-smoke")
        outputs = pool.run_genome(handle, genome, task.inputs_only())
        assert set(outputs) == {p.case_id for p in task.problems}
        snap = pool.snapshot(handle)
        pool.restore(handle, snap)
        assert pool.handle_by_id(handle.sandbox_id) is handle
    finally:
        pool.close()
