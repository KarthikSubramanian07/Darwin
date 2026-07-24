"""Shared model-client factory. Used by the Fireworks mutation engine (Lane A) and the parallel
model race (Lane C), so both go through one place.

This is where Braintrust becomes core to inference, not just to scoring: when the Braintrust
gateway is enabled, every model call in the race and every mutation request is routed through
`https://gateway.braintrust.dev/v1` authenticated with the Braintrust key, so Braintrust traces,
costs, and scores the whole population's inference. The Fireworks (or any provider) key lives in
Braintrust org settings, not locally.

Two modes (verified 2026-07, braintrust.dev + fireworks.ai):
  * gateway  -> base_url=https://gateway.braintrust.dev/v1, api_key=BRAINTRUST_API_KEY,
               model="fireworks/<slug>"                              (Braintrust is core)
  * direct   -> base_url=https://api.fireworks.ai/inference/v1, api_key=FIREWORKS_API_KEY,
               model="accounts/fireworks/models/<slug>"             (fallback / offline-adjacent)

Both are OpenAI-compatible, so callers use the same `client.chat.completions.create(...)`.
"""

from __future__ import annotations

from dataclasses import dataclass

from darwin.config import Config

GATEWAY_URL = "https://gateway.braintrust.dev/v1"


def _slug(model: str) -> str:
    """The bare model slug, e.g. 'accounts/fireworks/models/llama-v3p1-8b-instruct' ->
    'llama-v3p1-8b-instruct'."""
    return model.rsplit("/", 1)[-1]


@dataclass
class ModelClient:
    client: object  # an openai.OpenAI instance
    route: str  # "gateway" | "direct"

    def resolve_model(self, genome_model: str) -> str:
        """Translate the genome's model gene into the id this route expects."""
        slug = _slug(genome_model)
        return f"fireworks/{slug}" if self.route == "gateway" else f"accounts/fireworks/models/{slug}"


def make_model_client(config: Config) -> ModelClient:
    """Build the model client for this run. Prefers the Braintrust gateway when enabled + keyed,
    so inference is traced in Braintrust; falls back to calling Fireworks directly."""
    from openai import OpenAI  # imported lazily so the offline path never needs the package

    if config.use_braintrust_gateway and config.braintrust_api_key:
        return ModelClient(
            client=OpenAI(base_url=config.braintrust_gateway_url, api_key=config.braintrust_api_key),
            route="gateway",
        )
    return ModelClient(
        client=OpenAI(base_url=config.fireworks_base_url, api_key=config.fireworks_api_key),
        route="direct",
    )


def describe_route(config: Config) -> str:
    """Human-readable summary of where inference will go (for logs / the dashboard)."""
    if config.use_braintrust_gateway and config.braintrust_api_key:
        return "Fireworks via Braintrust gateway (traced + scored in Braintrust)"
    if config.fireworks_api_key:
        return "Fireworks direct"
    return "offline (no model calls; canned mutations)"
