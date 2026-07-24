"""Daytona sandbox pool: real containment + parallelism + rollback. LANE C owns this file.

Untrusted, self-written genome code executes ONLY here (or in the honestly-weaker local
fallback), never in the host process. Implements the same `SandboxPool` protocol as
darwin/sandbox/local.py, which is the reference for all semantics (timeouts -> per-case error
dicts, crashes -> stderr tail).

Verified SDK surface (2026-07-24, live probe + github.com/daytonaio/daytona SDK source; see
DECISIONS.md D5/D12 and LEARNINGS.md):
  * `Daytona(DaytonaConfig(api_key=...))`; `daytona.create()` (~350ms); `daytona.delete(sbx)`.
  * `sandbox.process.exec(cmd, cwd=..., timeout=...)` -> `.exit_code`, `.result` (stdout).
  * `sandbox.fs.upload_file(bytes, remote_path)`.
  * Platform snapshots exist but are EXPERIMENTAL + slow (object storage, state polling), so
    per-variant rollback uses in-sandbox directory snapshots (`cp -a`), mirroring the local
    reference implementation exactly (DECISIONS D12).

Sandboxes are created once and REUSED across generations (run dirs are wiped per run), so a
demo run costs ~population_size creations, not population x generations.
"""

from __future__ import annotations

import concurrent.futures as cf
import io
import json
import tarfile
import tempfile
import threading
from pathlib import Path

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.sandbox.base import RunOutputs, SandboxHandle
from darwin.sandbox.harness import HARNESS_SRC, parse_result

_ROOT = "/tmp/darwin"
_RUN_DIR = f"{_ROOT}/run"
_SNAP_DIR = f"{_ROOT}/snaps"
_PKG = f"{_ROOT}/pkg.tgz"
_WALL_TIMEOUT_S = 20  # generous vs local.py's 10s: covers remote exec overhead


class DaytonaHandle(SandboxHandle):
    def __init__(self, sandbox_id: str, sandbox) -> None:  # noqa: ANN001 - SDK object
        super().__init__(sandbox_id)
        self.sandbox = sandbox
        self.lock = threading.Lock()  # one run at a time per sandbox


class DaytonaSandboxPool:
    """Implements the SandboxPool protocol against real Daytona sandboxes."""

    is_real_isolation = True

    def __init__(self, config: Config):
        if not config.daytona_api_key:
            raise RuntimeError("DAYTONA_API_KEY missing; cannot start the Daytona pool")
        from daytona import Daytona, DaytonaConfig  # deferred: import only when flag is on

        self.config = config
        self._daytona = Daytona(DaytonaConfig(api_key=config.daytona_api_key))
        self._handles: list[DaytonaHandle] = []
        self._snap_count = 0
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #

    def acquire(self, n: int) -> list[DaytonaHandle]:
        """Return n ready sandboxes, creating any shortfall concurrently (the headline
        parallelism use) and reusing existing ones across generations."""
        with self._lock:
            missing = n - len(self._handles)
            if missing > 0:
                with cf.ThreadPoolExecutor(max_workers=min(missing, 16)) as pool:
                    created = list(pool.map(lambda _i: self._create_one(), range(missing)))
                self._handles.extend(created)
            return self._handles[:n]

    def _create_one(self) -> DaytonaHandle:
        sandbox = self._daytona.create()
        sandbox.process.exec(f"mkdir -p {_RUN_DIR} {_SNAP_DIR}")
        return DaytonaHandle(sandbox.id, sandbox)

    def handle_by_id(self, sandbox_id: str) -> DaytonaHandle | None:
        """Look up a live handle so guards._rollback can restore it (SPEC section 11)."""
        for h in self._handles:
            if h.sandbox_id == sandbox_id:
                return h
        return None

    # ------------------------------------------------------------------ #

    def run_genome(self, handle: DaytonaHandle, genome: Genome, inputs_spec: dict) -> RunOutputs:
        """Materialize the genome + harness in the sandbox, execute, parse the result line.

        One tarball upload instead of ~14 file uploads keeps the round-trips down; the
        harness itself never sees expected answers (immutable-grader property)."""
        pkg = self._build_package(genome, inputs_spec)
        with handle.lock:
            try:
                handle.sandbox.fs.upload_file(pkg, _PKG)
                unpack = handle.sandbox.process.exec(
                    f"rm -rf {_RUN_DIR} && mkdir -p {_RUN_DIR} && tar xzf {_PKG} -C {_RUN_DIR}",
                    timeout=_WALL_TIMEOUT_S,
                )
                if unpack.exit_code != 0:
                    return self._all_errors(inputs_spec, f"unpack failed: {unpack.result}")
                proc = handle.sandbox.process.exec(
                    "python3 harness.py", cwd=_RUN_DIR, timeout=_WALL_TIMEOUT_S
                )
            except Exception as e:  # noqa: BLE001 - remote blips become per-case errors
                return self._all_errors(inputs_spec, f"sandbox exec failed: {e}")
        try:
            return parse_result(proc.result or "")
        except ValueError:
            tail = (proc.result or "harness crashed").strip()[-500:]
            return self._all_errors(inputs_spec, tail)

    @staticmethod
    def _build_package(genome: Genome, inputs_spec: dict) -> bytes:
        """genome files + inputs.json + harness.py as an in-memory tar.gz."""
        with tempfile.TemporaryDirectory(prefix="darwin-pkg-") as td:
            root = Path(td)
            genome.to_files(root)
            (root / "inputs.json").write_text(json.dumps(inputs_spec))
            (root / "harness.py").write_text(HARNESS_SRC)
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w:gz") as tar:
                for path in sorted(root.rglob("*")):
                    tar.add(path, arcname=str(path.relative_to(root)))
            return buf.getvalue()

    @staticmethod
    def _all_errors(inputs_spec: dict, message: str) -> RunOutputs:
        return {
            pid: [{"got": None, "error": message} for _ in info["cases"]]
            for pid, info in inputs_spec.items()
        }

    # ------------------------------------------------------------------ #

    def snapshot(self, handle: DaytonaHandle) -> str:
        """In-sandbox directory snapshot (fast path; DECISIONS D12). Mirrors local.py."""
        with self._lock:
            self._snap_count += 1
            snap_id = f"{handle.sandbox_id}-snap-{self._snap_count}"
        handle.sandbox.process.exec(
            f"cp -a {_RUN_DIR} {_SNAP_DIR}/{snap_id}", timeout=_WALL_TIMEOUT_S
        )
        return snap_id

    def restore(self, handle: DaytonaHandle, snapshot_id: str) -> None:
        """The rollback primitive: restore the run dir from a snapshot, inside the sandbox."""
        handle.sandbox.process.exec(
            f"rm -rf {_RUN_DIR} && cp -a {_SNAP_DIR}/{snapshot_id} {_RUN_DIR}",
            timeout=_WALL_TIMEOUT_S,
        )

    # ------------------------------------------------------------------ #

    def close(self) -> None:
        """Delete every sandbox; a leaked sandbox costs money, so never skip this."""
        handles, self._handles = self._handles, []
        if not handles:
            return
        with cf.ThreadPoolExecutor(max_workers=min(len(handles), 16)) as pool:
            for h in handles:
                pool.submit(self._delete_quiet, h)

    def _delete_quiet(self, handle: DaytonaHandle) -> None:
        try:
            self._daytona.delete(handle.sandbox)
        except Exception:  # noqa: BLE001 - best-effort cleanup
            pass
