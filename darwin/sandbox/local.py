"""Local subprocess sandbox pool: the offline fallback used when FEATURE_DAYTONA=0.

HONEST CAVEAT (see DECISIONS.md D2): this is NOT real isolation. It runs the genome's code
in a separate Python process inside a temp directory, with a wall-clock timeout and (on POSIX)
soft CPU/memory rlimits. It is the demo floor and offline insurance, not a security boundary.
Real containment is darwin/sandbox/daytona.py.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from darwin.core.genome import Genome
from darwin.sandbox.base import RunOutputs, SandboxHandle
from darwin.sandbox.harness import HARNESS_SRC, parse_result

_CPU_SECONDS = 5
_MEM_BYTES = 512 * 1024 * 1024
_WALL_TIMEOUT = 10


def _limit_resources() -> None:  # pragma: no cover - POSIX-only, exercised in subprocess
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (_CPU_SECONDS, _CPU_SECONDS))
        resource.setrlimit(resource.RLIMIT_AS, (_MEM_BYTES, _MEM_BYTES))
    except Exception:
        pass


class LocalHandle(SandboxHandle):
    def __init__(self, sandbox_id: str, workdir: Path):
        super().__init__(sandbox_id)
        self.workdir = workdir


class LocalSandboxPool:
    """Implements the SandboxPool protocol with local temp dirs."""

    is_real_isolation = False

    def __init__(self):
        self._root = Path(tempfile.mkdtemp(prefix="darwin-local-"))
        self._handles: list[LocalHandle] = []
        self._snapshots: dict[str, Path] = {}
        self._counter = 0

    def acquire(self, n: int) -> list[LocalHandle]:
        handles = []
        for _ in range(n):
            self._counter += 1
            wd = self._root / f"sbx-{self._counter}"
            (wd / "tools").mkdir(parents=True, exist_ok=True)
            h = LocalHandle(sandbox_id=f"local-{self._counter}", workdir=wd)
            self._handles.append(h)
            handles.append(h)
        return handles

    def run_genome(self, handle: LocalHandle, genome: Genome, inputs_spec: dict) -> RunOutputs:
        wd = handle.workdir
        # clear tools from any prior run in this reused sandbox
        tools_dir = wd / "tools"
        if tools_dir.exists():
            shutil.rmtree(tools_dir)
        genome.to_files(wd)
        (wd / "inputs.json").write_text(json.dumps(inputs_spec))
        (wd / "harness.py").write_text(HARNESS_SRC)
        try:
            proc = subprocess.run(
                [sys.executable, "harness.py"],
                cwd=wd,
                capture_output=True,
                text=True,
                timeout=_WALL_TIMEOUT,
                preexec_fn=_limit_resources if sys.platform != "win32" else None,
            )
        except subprocess.TimeoutExpired:
            return {pid: [{"got": None, "error": "timeout"} for _ in info["cases"]] for pid, info in inputs_spec.items()}
        try:
            return parse_result(proc.stdout)
        except ValueError:
            err = (proc.stderr or "harness crashed").strip()[-500:]
            return {pid: [{"got": None, "error": err} for _ in info["cases"]] for pid, info in inputs_spec.items()}

    def handle_by_id(self, sandbox_id: str) -> LocalHandle | None:
        """Look up a live handle so guards._rollback can restore it (SPEC section 11)."""
        for h in self._handles:
            if h.sandbox_id == sandbox_id:
                return h
        return None

    def snapshot(self, handle: LocalHandle) -> str:
        snap_id = f"{handle.sandbox_id}-snap-{len(self._snapshots)}"
        dest = self._root / f"{snap_id}"
        shutil.copytree(handle.workdir, dest)
        self._snapshots[snap_id] = dest
        return snap_id

    def restore(self, handle: LocalHandle, snapshot_id: str) -> None:
        src = self._snapshots[snapshot_id]
        if handle.workdir.exists():
            shutil.rmtree(handle.workdir)
        shutil.copytree(src, handle.workdir)

    def close(self) -> None:
        shutil.rmtree(self._root, ignore_errors=True)
