"""Entry point + CLI: start an evolution run.

    python -m darwin.main [--task default] [--offline]

Wiring (TODO across lanes):
  1. load config + .env
  2. construct Braintrust fitness, Daytona pool (pre-warm), Mutator, Guards, EventChannel
  3. start the dashboard WS server
  4. engine.run(task) streaming events to the dashboard each step
  5. persist the RunRecord to data/runs/ (for offline replay / honest fallback)

With ALL feature flags off (local sandbox + local scorer + canned mutations) the loop must
still run and still CLIMB on a canned task. That is the demo floor.
"""

from __future__ import annotations

import argparse

from darwin.config import load_config


def build_engine(config):  # noqa: ANN001
    """Construct and wire the engine + its collaborators. TODO."""
    raise NotImplementedError


def main() -> None:
    parser = argparse.ArgumentParser(description="Darwin: evolve an agent, safely.")
    parser.add_argument("--task", default="default", help="task id under data/task/")
    parser.add_argument("--offline", action="store_true", help="force all feature flags off")
    args = parser.parse_args()

    config = load_config()
    print(f"Darwin starting | task={args.task} | features={config.features}")
    # TODO: build_engine(config).run(Task.load(args.task)) -> persist RunRecord
    raise SystemExit("Not yet implemented — see the build plan / lane owners.")


if __name__ == "__main__":
    main()
