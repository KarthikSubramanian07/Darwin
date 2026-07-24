"""Runner glue: instantiate a Genome as a runnable agent and run it in a sandbox.

LANE B owns this file.

Given a Genome and a Sandbox: materialize the genome to files, execute the agent loop
against task.py's cases inside the sandbox, and return structured outputs for fitness.py.
The agent's reasoning model during evaluation is provider-configurable (may run on Fireworks).
Parallelism is the headline Daytona use: evaluate the whole population concurrently.
"""

from __future__ import annotations

from darwin.core.genome import Genome
from darwin.eval.task import Task


def run_agent_in_sandbox(sandbox, genome: Genome, task: Task):  # noqa: ANN001
    """Materialize -> execute -> collect. Returns structured outputs for fitness scoring.
    TODO(Lane B)."""
    raise NotImplementedError
