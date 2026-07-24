"""Runner glue: run one genome in one sandbox and return structured outputs. LANE B.

Thin by design: it enforces the host-isolation guard, then hands off to the pool (Daytona or
local) which materializes the genome + harness and executes it. Parallelism across the pool is
orchestrated by the engine.
"""

from __future__ import annotations

from darwin.core.genome import Genome
from darwin.eval.task import Task
from darwin.sandbox.base import RunOutputs


def run_agent_in_sandbox(pool, handle, genome: Genome, task: Task, guards=None) -> RunOutputs:  # noqa: ANN001
    """Assert containment, then run the genome against the task's inputs inside the sandbox."""
    if guards is not None:
        guards.assert_sandboxed(handle)
    return pool.run_genome(handle, genome, task.inputs_only())
