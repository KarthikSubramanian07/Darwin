"""Synthesize evaluation cases for a task. LANE A.

Fireworks path: one JSON call producing {args, expected} pairs. Offline path: the curated cases
in pipeline/industries.py. SPOT-CHECK generated cases by hand: garbage cases mean a meaningless
leaderboard, and the Braintrust judge reads the dataset first.
"""

from __future__ import annotations

import json

from darwin.config import Config
from pipeline.decompose import TaskSpec
from pipeline.industries import INDUSTRIES


def synth_cases(spec: TaskSpec, config: Config, n: int = 8) -> list[dict]:
    if config.features.fireworks and config.fireworks_api_key:
        canned = _offline_cases(spec)
        if not canned:  # only generate for tasks not already curated
            try:
                return _fireworks_cases(spec, config, n)
            except Exception:  # noqa: BLE001
                pass
    return _offline_cases(spec)


def _offline_cases(spec: TaskSpec) -> list[dict]:
    for data in INDUSTRIES.values():
        for p in data["problems"]:
            if p["case_id"] == spec.case_id:
                return [dict(c) for c in p["cases"]]
    return []


_SYNTH_PROMPT = (
    "Generate {n} evaluation cases for a single-function task. The function is "
    "`{entrypoint}(text)` and should: {prompt}. Return STRICT JSON: "
    '{{"cases": [{{"args": [<input string>], "expected": <the correct return value>}}]}}. '
    "Make inputs realistic and varied; expected must be exactly what a correct function returns."
)


def _fireworks_cases(spec: TaskSpec, config: Config, n: int) -> list[dict]:
    from darwin.llm import make_model_client

    mc = make_model_client(config)
    model = mc.resolve_model("accounts/fireworks/models/gpt-oss-120b")
    resp = mc.client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": _SYNTH_PROMPT.format(n=n, entrypoint=spec.entrypoint, prompt=spec.prompt),
            }
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content)
    cases = [c for c in data.get("cases", []) if "args" in c and "expected" in c]
    if not cases:
        raise ValueError("empty synthesis")
    return cases[:n]
