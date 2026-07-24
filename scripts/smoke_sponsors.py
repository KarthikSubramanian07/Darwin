"""Sponsor connectivity smoke (LANE C): verify keys + SDK surfaces in ~15 seconds.

    python scripts/smoke_sponsors.py

Run this before a demo or after touching .env. It makes one Fireworks catalog call and one
throwaway Daytona sandbox (created, exec'd, deleted). It does NOT run an evolution.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from darwin.config import load_config  # noqa: E402
from darwin.core.fw_client import RACE_MODELS, FireworksClient  # noqa: E402


def check_fireworks(config) -> bool:  # noqa: ANN001
    fw = FireworksClient(config)
    if not fw.enabled:
        print("[fireworks] SKIP (flag off or no FIREWORKS_API_KEY)")
        return False
    live = fw.catalog()
    missing = [m for m in RACE_MODELS if m not in live]
    print(f"[fireworks] OK - {len(live)} race models live")
    if missing:
        print(f"[fireworks] WARNING: pinned models missing from live catalog: {missing}")
        print("            (catalog drift - update fw_client.RACE_MODELS + DECISIONS D11)")
    return True


def check_daytona(config) -> bool:  # noqa: ANN001
    if not (config.features.daytona and config.daytona_api_key):
        print("[daytona]   SKIP (flag off or no DAYTONA_API_KEY)")
        return False
    from darwin.sandbox.daytona import DaytonaSandboxPool

    pool = DaytonaSandboxPool(config)
    try:
        t0 = time.time()
        (handle,) = pool.acquire(1)
        r = handle.sandbox.process.exec("python3 -c 'print(6*7)'")
        ok = r.exit_code == 0 and "42" in (r.result or "")
        print(f"[daytona]   {'OK' if ok else 'FAIL'} - sandbox up in "
              f"{int((time.time() - t0) * 1000)}ms, python3 exec {'works' if ok else 'BROKEN'}")
        return ok
    finally:
        pool.close()


def main() -> None:
    config = load_config()
    fw_ok = check_fireworks(config)
    dt_ok = check_daytona(config)
    if not (fw_ok and dt_ok):
        print("\nAt least one sponsor path is offline; the run will use local fallbacks.")


if __name__ == "__main__":
    main()
