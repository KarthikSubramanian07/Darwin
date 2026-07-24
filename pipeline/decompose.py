"""Decompose an industry into its real AI tasks. LANE A.

Fireworks path: one structured (JSON) call asking for the tasks a team in `industry` would ship
an agent for. Offline path: the curated library in pipeline/industries.py (or a generic stub for
unknown industries). Always returns a list of TaskSpec; never raises during a demo.
"""

from __future__ import annotations

import json

from pydantic import BaseModel

from darwin.config import Config
from pipeline.industries import INDUSTRIES


class TaskSpec(BaseModel):
    case_id: str  # snake_case id / entrypoint
    entrypoint: str
    prompt: str
    task_type: str = "structured"  # "code" | "text" | "structured"


def industry_to_tasks(industry: str, config: Config, n_tasks: int = 5) -> list[TaskSpec]:
    key = industry.lower().strip()
    if config.features.fireworks and config.fireworks_api_key and key not in INDUSTRIES:
        try:
            return _fireworks_decompose(industry, config, n_tasks)
        except Exception:  # noqa: BLE001 - never block the demo on a model call
            pass
    return _offline_decompose(key, industry)


def _offline_decompose(key: str, industry: str) -> list[TaskSpec]:
    data = INDUSTRIES.get(key)
    if data:
        return [
            TaskSpec(
                case_id=p["case_id"],
                entrypoint=p["entrypoint"],
                prompt=p["prompt"],
                task_type=p["task_type"],
            )
            for p in data["problems"]
        ]
    # unknown industry, offline: a single generic transform task so the shape is still valid
    return [
        TaskSpec(
            case_id="summarize",
            entrypoint="summarize",
            prompt=f"Summarize a {industry} document into one sentence.",
            task_type="text",
        )
    ]


_DECOMPOSE_PROMPT = (
    "You are decomposing an industry into the concrete, single-function AI tasks a team would "
    "build an agent for. Each task must be expressible as one Python function `entrypoint(text)` "
    "that returns a value gradable by exact match or string similarity. Return STRICT JSON: "
    '{{"tasks": [{{"case_id": snake_case, "entrypoint": snake_case, "prompt": one sentence, '
    '"task_type": "structured"|"text"}}]}}. Industry: {industry}. Give {n} tasks.'
)


def _fireworks_decompose(industry: str, config: Config, n_tasks: int) -> list[TaskSpec]:
    from darwin.llm import make_model_client

    mc = make_model_client(config)
    # gpt-oss-120b is the cheap, fast serverless workhorse on the live Fireworks catalog (2026-07).
    model = mc.resolve_model("accounts/fireworks/models/gpt-oss-120b")
    resp = mc.client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": _DECOMPOSE_PROMPT.format(industry=industry, n=n_tasks)}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content)
    specs = [TaskSpec(**t) for t in data.get("tasks", [])][:n_tasks]
    if not specs:
        raise ValueError("empty decomposition")
    return specs
