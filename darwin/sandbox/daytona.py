"""Daytona sandbox pool + snapshot/restore. LANE B owns this file.

Containment + parallelism + rollback. Untrusted, self-written tool code executes ONLY here,
never in the host process.

VERIFY the Daytona SDK (create sandbox, exec, read/write files, snapshot/restore) against
current docs before writing calls. Do not invent method names.

If config.features.daytona is False, fall back to a local subprocess sandbox (temp dir +
resource-limited shell). That fallback is NOT real isolation and must be honestly labeled
as such in DECISIONS.md.
"""

from __future__ import annotations

from darwin.config import Config


class SandboxPool:
    def __init__(self, config: Config):
        self.config = config
        self.use_daytona = config.features.daytona

    def pool(self, n: int):
        """Provision up to `n` sandboxes (pre-warm at startup; keep spares). TODO(Lane B)."""
        raise NotImplementedError

    def run_genome(self, sandbox, genome):  # noqa: ANN001
        """Drop the genome's files in, run the agent against the task cases inside the
        sandbox, capture outputs/errors. Untrusted code runs only here. TODO(Lane B)."""
        raise NotImplementedError

    def snapshot(self, sandbox) -> str:  # noqa: ANN001
        """Snapshot before running a mutated genome; return snapshot_id. TODO(Lane B)."""
        raise NotImplementedError

    def restore(self, sandbox, snapshot_id: str) -> None:  # noqa: ANN001
        """Restore a sandbox from a snapshot (the rollback primitive). Fast + clean."""
        raise NotImplementedError
