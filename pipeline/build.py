"""Assemble an industry into a runnable Task and persist it. LANE A.

    python -m pipeline.build "legal"      -> data/task/legal.json
    python -m darwin.main --task legal    -> evolve an agent for that industry

Known industries (pipeline/industries.py) build from the curated library, ladders included, so
they climb offline. Unknown industries are decomposed + synthesized live via Fireworks (each
problem gets a seed stub as ladder rung 0; the real Fireworks mutator writes the solutions).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from darwin.config import Config, load_config
from darwin.eval.task import Case, Problem, Task
from darwin.safety.ids import slugify
from pipeline.decompose import TaskSpec, industry_to_tasks
from pipeline.industries import INDUSTRIES
from pipeline.synth import synth_cases

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "task"


def _seed_stub(spec: TaskSpec) -> str:
    return f"def {spec.entrypoint}(text):\n    return None\n"


def build_industry_task(industry: str, config: Config) -> Task:
    key = slugify(industry)

    if key in INDUSTRIES:
        data = INDUSTRIES[key]
        problems = [Problem(**p) for p in data["problems"]]
        return Task(task_id=key, industry=key, description=data["description"], problems=problems)

    # unknown industry: decompose + synthesize live (Fireworks), else a generic offline stub
    specs = industry_to_tasks(industry, config)
    problems = []
    for spec in specs:
        cases = [Case(**c) for c in synth_cases(spec, config)]
        problems.append(
            Problem(
                case_id=spec.case_id,
                entrypoint=spec.entrypoint,
                prompt=spec.prompt,
                task_type=spec.task_type,
                cases=cases,
                ladder=[_seed_stub(spec)],  # rung 0 only; live Fireworks mutation writes the fix
            )
        )
    return Task(task_id=key, industry=key, description=f"{industry} tasks", problems=problems)


def write_task(task: Task) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{task.task_id}.json"
    path.write_text(json.dumps(task.model_dump(), indent=2) + "\n")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an industry into a Darwin task.")
    parser.add_argument("industry", help="e.g. legal, support, or a new one")
    args = parser.parse_args()
    config = load_config()
    task = build_industry_task(args.industry, config)
    path = write_task(task)
    print(
        f"[pipeline] {task.task_id}: {len(task.problems)} tasks, {task.total_cases} cases -> {path}"
    )
    print(f"[pipeline] now run:  python -m darwin.main --task {task.task_id}")


if __name__ == "__main__":
    main()
