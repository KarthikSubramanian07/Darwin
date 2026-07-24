"""Turn a supported industry into small, evaluable Darwin tasks.

Run ``python -m pipeline.decompose legal --offline`` to materialize the reviewed fallback
datasets under ``data/task/``. With ``FEATURE_FIREWORKS=1``, Darwin asks Fireworks for task
outlines first and still falls back to the curated lists if that request fails.
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

from pydantic import BaseModel, Field

from darwin.config import Config, load_config
from darwin.eval.task import Problem, Task


class TaskOutline(BaseModel):
    task_id: str
    description: str
    prompt: str
    task_type: str = "structured"


class IndustryOutline(BaseModel):
    tasks: list[TaskOutline] = Field(min_length=4, max_length=6)


_CANNED_OUTLINES: dict[str, list[TaskOutline]] = {
    "legal": [
        TaskOutline(task_id="legal_clause_type", description="Classify a contract clause by purpose.", prompt="Classify the clause type."),
        TaskOutline(task_id="legal_governing_law", description="Extract the governing jurisdiction.", prompt="Extract governing law."),
        TaskOutline(task_id="legal_payment_terms", description="Extract payment terms into a structured record.", prompt="Extract payment terms."),
        TaskOutline(task_id="legal_renewal", description="Detect contract renewal behavior.", prompt="Classify renewal behavior."),
        TaskOutline(task_id="legal_confidentiality", description="Identify confidentiality obligations.", prompt="Classify confidentiality scope."),
    ],
    "support": [
        TaskOutline(task_id="support_intent", description="Route a customer message to its primary intent.", prompt="Classify ticket intent."),
        TaskOutline(task_id="support_priority", description="Assign a support priority from customer impact.", prompt="Classify support priority."),
        TaskOutline(task_id="support_sentiment", description="Classify customer sentiment.", prompt="Classify ticket sentiment."),
        TaskOutline(task_id="support_refund_policy", description="Determine the refund-policy outcome.", prompt="Classify refund eligibility."),
        TaskOutline(task_id="support_order_status", description="Extract the requested order-status action.", prompt="Classify order-status request."),
    ],
}


def _problem_id(task_id: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", task_id.lower()).strip("_")


def _safe_error(exc: Exception) -> str:
    """Make a live-data fallback diagnosable without storing credentials in a dataset."""
    message = str(exc).replace("\n", " ")
    message = re.sub(r"\b(?:sk|fw|dtn)_[A-Za-z0-9_-]+", "<redacted>", message)
    message = re.sub(r"(?i)(bearer\s+)[^\s,;]+", r"\1<redacted>", message)
    return f"{type(exc).__name__}: {message[:240]}"


def _to_task(industry: str, outline: TaskOutline, source: str, error: str = "") -> Task:
    problem_id = _problem_id(outline.task_id)
    return Task(
        task_id=problem_id,
        description=outline.description,
        industry=industry,
        problems=[
            Problem(
                case_id=problem_id,
                entrypoint="solve",
                prompt=outline.prompt,
                # Industry tasks are structured exact-match tasks. Keep this frozen shared
                # contract even if Fireworks describes the classification more specifically.
                task_type="structured",
                scorer_config={
                    "method": "exact_match",
                    "task_source": source,
                    **({"task_generation_error": error} if error else {}),
                },
            )
        ],
    )


def _fireworks_outlines(industry: str, config: Config) -> list[TaskOutline]:
    """One structured Fireworks call. Callers handle failure with the canned fallback."""
    from openai import OpenAI

    canonical_ids = [outline.task_id for outline in _CANNED_OUTLINES[industry]]
    client = OpenAI(api_key=config.fireworks_api_key, base_url=config.fireworks_base_url)
    response = client.chat.completions.create(
        model=config.fireworks_mutator_model,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Improve the descriptions and prompts for these objectively gradeable {industry} "
                    f"workflow tasks: {', '.join(canonical_ids)}. Return exactly those task IDs, one "
                    "each, with structured exact-match outputs. Return JSON only."
                ),
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "industry_outline", "schema": IndustryOutline.model_json_schema()},
        },
        temperature=0,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("Fireworks returned an empty industry outline")
    outlines = IndustryOutline.model_validate_json(content).tasks
    if {outline.task_id for outline in outlines} != set(canonical_ids):
        raise ValueError("Fireworks did not preserve the canonical task IDs")
    return outlines


def industry_to_tasks(industry: str, config: Config | None = None) -> list[Task]:
    """Return 4 to 6 tasks for an industry, with an offline Legal/Support fallback."""
    normalized = industry.strip().lower()
    if normalized not in _CANNED_OUTLINES:
        raise ValueError(f"Unsupported offline industry: {industry}. Choose legal or support.")
    config = config or load_config()
    outlines = _CANNED_OUTLINES[normalized]
    source = "canned"
    error = ""
    if config.features.fireworks and config.fireworks_api_key:
        try:
            outlines = _fireworks_outlines(normalized, config)
            source = "fireworks"
        except Exception as exc:  # noqa: BLE001 - decomposition must retain a deterministic fallback
            error = _safe_error(exc)
    return [_to_task(normalized, outline, source, error) for outline in outlines]


def main() -> None:
    parser = argparse.ArgumentParser(description="Decompose an industry into Darwin task datasets.")
    parser.add_argument("industry", choices=sorted(_CANNED_OUTLINES))
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true", help="use reviewed canned tasks and cases")
    mode.add_argument("--live", action="store_true", help="generate new task outlines and cases with Fireworks")
    parser.add_argument("--output-dir", help="directory for generated task JSON files")
    args = parser.parse_args()
    if not args.live:
        os.environ["FEATURE_FIREWORKS"] = "0"

    from pipeline.synth import generate_cases, write_task

    config = load_config()
    tasks = industry_to_tasks(args.industry, config)
    if args.output_dir:
        output_dir = Path(args.output_dir)
    elif args.live:
        output_dir = Path("data") / "review" / f"{args.industry}-live"
    else:
        output_dir = None
    for task in tasks:
        completed = generate_cases(task, config)
        path = write_task(completed, output_dir) if output_dir is not None else write_task(completed)
        scorer_config = completed.problems[0].scorer_config
        source = scorer_config.get("case_source", "unknown")
        errors = [
            scorer_config[name]
            for name in ("task_generation_error", "case_generation_error")
            if name in scorer_config
        ]
        detail = f" [{'; '.join(errors)}]" if errors else ""
        print(f"{completed.task_id}: {completed.total_cases} cases ({source}){detail} -> {path}")


if __name__ == "__main__":
    main()
