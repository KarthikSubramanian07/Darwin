"""Pre-compute the honest run library (LANE C): N full runs -> data/runs/*.json.

    python scripts/precompute_library.py --runs 3            # live (uses .env flags/keys)
    python scripts/precompute_library.py --runs 3 --offline  # flag-off dry-runs

Each run gets its own seed (base seed + index) so the library shows distinct, real climbs.
Every record is a genuine engine run persisted via darwin.main.persist; the dashboard shows
them with the explicit "cached" badge (SPEC section 3 honesty rule - never present a cached
run as live). Wall-clock per run is printed so the <2 minute live-run budget (SPEC section 3)
is measured, not assumed.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-compute RunRecords for the library.")
    parser.add_argument("--runs", type=int, default=3, help="how many runs to record")
    parser.add_argument("--task", default="coding_bench", help="task id under data/task/")
    parser.add_argument("--offline", action="store_true", help="force all feature flags off")
    parser.add_argument("--seed", type=int, default=None, help="base seed (default: env/1337)")
    args = parser.parse_args()

    if args.offline:
        for var in (
            "FEATURE_DAYTONA",
            "FEATURE_BRAINTRUST",
            "FEATURE_FIREWORKS",
            "FEATURE_CODERABBIT",
        ):
            os.environ[var] = "0"

    base_seed = args.seed if args.seed is not None else int(os.getenv("RANDOM_SEED", "1337"))
    from darwin.config import load_config
    from darwin.eval.task import Task
    from darwin.main import build_engine, persist

    for i in range(args.runs):
        os.environ["RANDOM_SEED"] = str(base_seed + i)
        config = load_config()
        task = Task.load(args.task)
        engine, sandboxes, _events = build_engine(config, task)
        t0 = time.time()
        try:
            record = engine.run(task)
        finally:
            sandboxes.close()
        wall = time.time() - t0
        path = persist(record)
        budget = "OK" if wall < 120 else "OVER the 2-minute live budget"
        print(
            f"[library] run {i + 1}/{args.runs} seed={base_seed + i} "
            f"wall={wall:.1f}s ({budget}) curve={record.fitness_curve} -> {path.name}"
        )


if __name__ == "__main__":
    main()
