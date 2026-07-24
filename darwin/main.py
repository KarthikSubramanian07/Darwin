"""Entry point + CLI: start an evolution run.

    python -m darwin.main [--task coding_bench] [--offline] [--echo]

With ALL feature flags off (local sandbox + local scorer + canned mutations) the loop still
runs and still CLIMBS on the canned task. That is the demo floor.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from darwin.config import Config, load_config
from darwin.core.engine import EvolutionEngine
from darwin.core.mutate import Mutator
from darwin.eval.fitness import Fitness
from darwin.eval.task import Task
from darwin.safety.guards import Guards
from darwin.server.events import EventChannel

RUNS_DIR = Path(__file__).resolve().parents[1] / "data" / "runs"


def _make_sandbox_pool(config: Config):
    """Return a sandbox pool: Daytona when enabled and importable, else the local fallback."""
    if config.features.daytona:
        try:
            from darwin.sandbox.daytona import DaytonaSandboxPool

            return DaytonaSandboxPool(config)
        except Exception as e:  # noqa: BLE001 - never let a missing SDK block the demo floor
            print(f"[darwin] Daytona unavailable ({e}); falling back to local sandbox.")
    from darwin.sandbox.local import LocalSandboxPool

    return LocalSandboxPool()


def build_engine(config: Config, task: Task, *, echo: bool = False):
    events = EventChannel(echo=echo)
    sandboxes = _make_sandbox_pool(config)
    fitness = Fitness(config, task)
    mutator = Mutator(config, task)
    guards = Guards(config, sandboxes=sandboxes, events=events)
    engine = EvolutionEngine(
        config, fitness=fitness, sandboxes=sandboxes, mutator=mutator, guards=guards, events=events
    )
    return engine, sandboxes, events


def persist(record) -> Path:  # noqa: ANN001
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNS_DIR / f"{record.run_id}.json"
    path.write_text(record.model_dump_json(indent=2))
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Darwin: evolve the best whole agent, safely.")
    parser.add_argument("--task", default="coding_bench", help="task id under data/task/")
    parser.add_argument("--offline", action="store_true", help="force all feature flags off")
    parser.add_argument("--echo", action="store_true", help="print each event to stdout")
    args = parser.parse_args()

    if args.offline:
        for var in ("FEATURE_DAYTONA", "FEATURE_BRAINTRUST", "FEATURE_FIREWORKS"):
            os.environ[var] = "0"

    config = load_config()
    task = Task.load(args.task)
    print(
        f"[darwin] task={task.task_id} cases={task.total_cases} "
        f"pop={config.population_size} gens={config.generations} features={config.features}"
    )

    engine, sandboxes, events = build_engine(config, task, echo=args.echo)
    try:
        record = engine.run(task)
    finally:
        sandboxes.close()

    path = persist(record)
    print("\n[darwin] fitness curve:", record.fitness_curve)
    report = record.config.get("offline_report")
    if report:
        print("[darwin] before/after:", json.dumps(report))
    print(f"[darwin] champion: {record.final_champion.genome_id if record.final_champion else None}")
    print(f"[darwin] run saved -> {path}")


if __name__ == "__main__":
    main()
