"""Shared sandbox types and the pool protocol. Both the Daytona pool and the local fallback
implement `SandboxPool`, so the engine never cares which one it got.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from darwin.core.genome import Genome

# problem_id -> list of {"got": value|None, "error": str|None}
RunOutputs = dict[str, list[dict]]


class SandboxHandle:
    """Opaque handle to one provisioned sandbox. Backends subclass and attach their own state
    (a Daytona sandbox object, or a local temp dir)."""

    def __init__(self, sandbox_id: str):
        self.sandbox_id = sandbox_id
        self.in_sandbox = True  # tripwire for the host-isolation assertion


@runtime_checkable
class SandboxPool(Protocol):
    """Provision sandboxes, run genomes in them, and snapshot/restore for rollback."""

    is_real_isolation: bool

    def acquire(self, n: int) -> list[SandboxHandle]:
        """Provision (or reuse) up to n sandboxes."""
        ...

    def run_genome(self, handle: SandboxHandle, genome: Genome, inputs_spec: dict) -> RunOutputs:
        """Materialize the genome + harness into the sandbox, run it, return parsed outputs."""
        ...

    def snapshot(self, handle: SandboxHandle) -> str:
        """Capture sandbox state; return a snapshot id."""
        ...

    def restore(self, handle: SandboxHandle, snapshot_id: str) -> None:
        """Restore sandbox state from a snapshot (the rollback primitive)."""
        ...

    def close(self) -> None:
        """Release all sandboxes."""
        ...
