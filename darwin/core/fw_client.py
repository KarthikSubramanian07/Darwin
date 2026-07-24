"""Fireworks client infra: bounded concurrency, retry/backoff, latency + cost capture.

LANE C owns this file. The mutation engine and the model race both call Fireworks through
here so burst limits (SPEC section 8) are handled in exactly one place.

Verified surface (2026-07-24, docs.fireworks.ai + live probe, see DECISIONS.md D11):
  * OpenAI-compatible: `OpenAI(base_url="https://api.fireworks.ai/inference/v1", api_key=...)`.
  * Live catalog: GET /v1/models (`client.models.list()`).
  * Billing truth is the per-response `usage` object (prompt_tokens / completion_tokens).

With FEATURE_FIREWORKS=0 or no API key, the client reports `enabled=False` and callers fall
back to their offline paths. Importing this module never requires the network.
"""

from __future__ import annotations

import random
import threading
import time
from dataclasses import dataclass

from darwin.config import Config

# Live serverless text-model catalog, verified against this account 2026-07-24 (GET /v1/models).
# flux-1-schnell-fp8 (image gen) is deliberately excluded from the race.
# Fireworks removed legacy serverless models 2026-05-14 (docs.fireworks.ai/updates/changelog),
# so do NOT reintroduce llama-v3p1 / qwen3 era ids here.
RACE_MODELS: tuple[str, ...] = (
    "accounts/fireworks/models/gpt-oss-120b",
    "accounts/fireworks/models/kimi-k2p6",
    "accounts/fireworks/models/glm-5p1",
    "accounts/fireworks/models/glm-5p2",
    "accounts/fireworks/models/deepseek-v4-pro",
)

# $ per 1M tokens (input, output), from fireworks.ai/models + docs.fireworks.ai/serverless/pricing
# (verified 2026-07-24; deepseek-v4-pro output uses the blended figure - see LEARNINGS.md).
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "accounts/fireworks/models/gpt-oss-120b": (0.15, 0.60),
    "accounts/fireworks/models/kimi-k2p6": (0.95, 4.00),
    "accounts/fireworks/models/glm-5p1": (1.40, 4.40),
    "accounts/fireworks/models/glm-5p2": (1.40, 4.40),
    "accounts/fireworks/models/deepseek-v4-pro": (1.74, 3.48),
}
_DEFAULT_PRICE = (1.0, 3.0)  # conservative fallback for unpriced models

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


@dataclass
class CallStats:
    """What one chat call cost us. Aggregated per-genome by the mutator."""

    latency_ms: int = 0
    tokens_in: int = 0
    tokens_out: int = 0
    cost_est: float = 0.0


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """$ estimate from the pinned per-1M-token price table."""
    price_in, price_out = MODEL_PRICES.get(model, _DEFAULT_PRICE)
    return (tokens_in * price_in + tokens_out * price_out) / 1_000_000


class FireworksClient:
    """Thin, thread-safe wrapper: semaphore + retry/backoff + stats on every chat call."""

    def __init__(self, config: Config, *, max_concurrency: int = 6, max_retries: int = 4):
        self.config = config
        self.enabled = bool(config.features.fireworks and config.fireworks_api_key)
        self._sem = threading.Semaphore(max_concurrency)
        self._max_retries = max_retries
        self._client = None  # lazy; never built when disabled

    # ------------------------------------------------------------------ #

    def _sdk(self):  # noqa: ANN202
        if self._client is None:
            from openai import OpenAI  # deferred so offline import never needs the package

            self._client = OpenAI(
                api_key=self.config.fireworks_api_key,
                base_url=self.config.fireworks_base_url,
                max_retries=0,  # we own retry/backoff (SDK default retries would stack)
            )
        return self._client

    # ------------------------------------------------------------------ #

    def catalog(self) -> list[str]:
        """Live serverless text models for the race; pinned fallback if the call fails."""
        if not self.enabled:
            return list(RACE_MODELS)
        try:
            ids = [m.id for m in self._sdk().models.list().data]
            live = [m for m in RACE_MODELS if m in ids]
            return live or list(RACE_MODELS)
        except Exception:  # noqa: BLE001 - catalog drift must never break a run
            return list(RACE_MODELS)

    # ------------------------------------------------------------------ #

    def chat(self, *, model: str, messages: list[dict], **kwargs):
        """One chat.completions.create with semaphore + backoff. Returns (response, CallStats).

        Raises the last error only after max_retries attempts; callers are expected to fall
        back to their offline path on any exception.
        """
        if not self.enabled:
            raise RuntimeError("FireworksClient disabled (flag off or no API key)")
        last_err: Exception | None = None
        with self._sem:
            for attempt in range(self._max_retries + 1):
                t0 = time.time()
                try:
                    resp = self._sdk().chat.completions.create(
                        model=model, messages=messages, **kwargs
                    )
                    usage = getattr(resp, "usage", None)
                    tokens_in = getattr(usage, "prompt_tokens", 0) or 0
                    tokens_out = getattr(usage, "completion_tokens", 0) or 0
                    stats = CallStats(
                        latency_ms=int((time.time() - t0) * 1000),
                        tokens_in=tokens_in,
                        tokens_out=tokens_out,
                        cost_est=estimate_cost(model, tokens_in, tokens_out),
                    )
                    return resp, stats
                except Exception as e:  # noqa: BLE001
                    last_err = e
                    if not self._retryable(e) or attempt == self._max_retries:
                        raise
                    # exponential backoff + jitter for burst limits (SPEC section 8)
                    time.sleep(min(8.0, (2**attempt) * 0.5) + random.uniform(0, 0.25))
        raise last_err  # pragma: no cover - loop always returns or raises

    @staticmethod
    def _retryable(err: Exception) -> bool:
        status = getattr(err, "status_code", None)
        if status is None:
            resp = getattr(err, "response", None)
            status = getattr(resp, "status_code", None)
        if status in _RETRYABLE_STATUS:
            return True
        # connection-level blips (no HTTP status) are retryable too
        return status is None and "connection" in type(err).__name__.lower()
