"""Braintrust logging: every variant becomes an auditable experiment. LANE B owns this file.

This is the "eval as selection pressure, and as evidence" story. When FEATURE_BRAINTRUST is on
and a key is present, each scored variant is logged as a Braintrust experiment tagged by task,
model, and generation, so the Braintrust project shows the population climbing and every cell of
the task x model grid is a real experiment a judge can open. When off (or the SDK/key is
missing), this is a clean no-op and scoring falls back to the local scorer, so the demo floor
never depends on the network.

Verified API (2026-07, braintrust.dev): `braintrust.init(project=, experiment=, api_key=,
metadata=, tags=, update=) -> Experiment`; `experiment.log(input=, output=, expected=,
scores={name: 0..1}, metadata=)`; `experiment.summarize().experiment_url`.
"""

from __future__ import annotations

from darwin.config import Config
from darwin.eval.task import Task

PROJECT = "Darwin"


def _model_short(model: str) -> str:
    return model.rsplit("/", 1)[-1] if model else "unknown"


class BraintrustLogger:
    def __init__(self, config: Config, task: Task):
        self.config = config
        self.task = task
        self.enabled = bool(config.features.braintrust and config.braintrust_api_key)
        self._problem_type = {p.case_id: p.task_type for p in task.problems}

    def log_variant(self, genome, generation: int, rows: list[dict]) -> str:  # noqa: ANN001
        """Log one variant's cases as a Braintrust experiment. Returns the experiment URL (or "").

        `rows` items: {problem_id, case_index, input, output, expected, error, score, scorer}.
        """
        if not self.enabled or not rows:
            return ""
        try:
            import braintrust

            experiment = braintrust.init(
                project=PROJECT,
                experiment=f"{self.task.task_id}/gen{generation}/{genome.genome_id}",
                api_key=self.config.braintrust_api_key,
                metadata={
                    "genome_id": genome.genome_id,
                    "generation": generation,
                    "task": self.task.task_id,
                    "industry": self.task.industry,
                    "model": genome.model,
                    "parent_ids": genome.parent_ids,
                },
                tags=[self.task.task_id, _model_short(genome.model), f"gen{generation}"],
                update=False,
            )
            for r in rows:
                experiment.log(
                    input=r["input"],
                    output=r["output"],
                    expected=r["expected"],
                    scores={r.get("scorer", "score"): r["score"]},
                    metadata={
                        "problem": r["problem_id"],
                        "case_index": r["case_index"],
                        "error": r["error"],
                        "task_type": self._problem_type.get(r["problem_id"], "code"),
                        "model": genome.model,
                    },
                )
            summary = experiment.summarize()
            return getattr(summary, "experiment_url", "") or ""
        except Exception:  # noqa: BLE001 - logging must never break the loop
            return ""
