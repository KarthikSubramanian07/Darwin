"""EvolutionEngine — the generational loop. LANE A owns this file (the sacred path).

    init -> evaluate -> select -> mutate -> repeat

Two invariants that MUST hold:
  * Elitism: the top ELITE_K genomes carry forward unchanged, so best_fitness is
    monotonic and the on-stage curve never drops.
  * Never raise out of run() during a demo: a failed variant scores 0 and is simply unfit.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.core.population import RunRecord


class EvolutionEngine:
    """Drives evolution and streams events to the dashboard after every step."""

    def __init__(self, config: Config, *, fitness, sandboxes, mutator, guards, events=None):
        self.config = config
        self.fitness = fitness  # eval.fitness  (immutable grader)
        self.sandboxes = sandboxes  # sandbox pool
        self.mutator = mutator  # core.mutate
        self.guards = guards  # safety.guards
        self.events = events  # server.events channel (optional)

    def run(self, task) -> RunRecord:  # noqa: ANN001
        """Run the full evolution and return a persisted RunRecord.

        TODO(Lane A):
          seed RNG with config.random_seed
          population = [Genome.seed(task) for _ in range(population_size)]  # gen 0
          for gen in range(generations):
              variants = self._evaluate_population(population)   # parallel, sandboxed
              variants = self.guards.filter(variants, prev_best) # reject regressions, roll back
              elite = select(variants, elite_k)
              emit best_fitness -> dashboard                     # the climbing curve
              # human-veto gate on promoting a NEW champion (auto-approve for demo speed)
              population = elite + self.mutator.mutate_offspring(elite, variants, n)
              enforce compute / wall-clock caps -> break if exceeded
          return RunRecord(...)
        """
        raise NotImplementedError

    def _evaluate_population(self, population):  # noqa: ANN001
        """Evaluate every genome in its own sandbox, scored by the fitness fn. Parallel."""
        raise NotImplementedError
