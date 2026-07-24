"""Scorers per task_type. LANE B owns this file.

The scorer is what makes a leaderboard credible, so scoring is explicit and per-type:

  * code / structured -> exact match on the returned value (deterministic; also how the
    coding benchmark is graded via real execution output).
  * text              -> similarity ratio offline; an LLM-as-judge (autoevals) when a judge
    model is configured. Kept deterministic offline so the demo floor never depends on a model.

autoevals scorers (ExactMatch, Levenshtein, ...) are used when the package is importable; each
has a pure-Python fallback so tests and the offline path never require it.
"""

from __future__ import annotations

from difflib import SequenceMatcher


def exact_match(got: object, expected: object) -> float:
    return 1.0 if got == expected else 0.0


def similarity_ratio(got: object, expected: object) -> float:
    """Normalized string similarity in 0..1 (stdlib, deterministic)."""
    a, b = str(got), str(expected)
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def score_case(task_type: str, got: object, expected: object, error: str | None) -> float:
    """Grade a single case. An execution error is always a 0."""
    if error is not None:
        return 0.0
    if task_type == "text":
        return similarity_ratio(got, expected)
    # code + structured + default: exact match on the value the agent's tool produced
    return exact_match(got, expected)


def autoevals_scorer(task_type: str):
    """Return an autoevals scorer instance for `task_type`, or None if unavailable.

    Lane B uses this when logging to Braintrust so the platform shows a named scorer; the
    numeric truth still comes from `score_case` so offline and online agree on code tasks.
    """
    try:
        import autoevals  # noqa: F401

        if task_type == "text":
            return autoevals.Levenshtein()
        return autoevals.ExactMatch()
    except Exception:  # noqa: BLE001 - autoevals is optional
        return None
