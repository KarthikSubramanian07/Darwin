"""Mutation + crossover. LANE A owns this file.

Phase 0 ships the deterministic OFFLINE canned mutator: given a parent's failure traces, it
advances up to two worst-scoring problems one rung along their ladders (broken -> correct).
Because a higher rung never passes fewer cases, offspring are monotonically better-or-equal,
which (with elitism) makes the on-stage curve climb reliably with all flags off.

Phase 3 adds the Fireworks path behind FEATURE_FIREWORKS: a fast model reads the same failure
traces and writes a real fix via function-calling. Same signature, so the engine never changes.

HARD RULE: the mutator only ever receives a Genome, never the fitness code. It cannot reach the
grader by construction.
"""

from __future__ import annotations

import json
import re

from darwin.config import Config
from darwin.core.genome import Genome
from darwin.core.population import Variant
from darwin.eval.task import Task

# The small default catalog keeps the model gene bounded and auditable. Add models only after
# verifying their current serverless availability in the Fireworks model library.
FIREWORKS_MUTATOR_MODEL = "accounts/fireworks/models/kimi-k2p6"
MODEL_CATALOG = (FIREWORKS_MUTATOR_MODEL, "accounts/fireworks/models/glm-5p1")


class Mutator:
    def __init__(self, config: Config, task: Task):
        self.config = config
        self.task = task
        self.use_fireworks = config.features.fireworks and bool(config.fireworks_api_key)
        self.mutator_model = getattr(config, "fireworks_mutator_model", FIREWORKS_MUTATOR_MODEL)
        self.model_catalog = tuple(
            getattr(config, "fireworks_model_catalog", MODEL_CATALOG) or MODEL_CATALOG
        )
        self._ladders = {p.case_id: p.ladder for p in task.problems}
        self._counter = 0

    # ------------------------------------------------------------------ #

    def mutate_offspring(
        self,
        elite: list[Variant],
        all_variants: list[Variant],
        n: int,
        generation: int = 1,
    ) -> list[Genome]:
        """Produce `n` children, using Fireworks when enabled and a safe canned fallback."""
        if not elite:
            return []
        children: list[Genome] = []
        for k in range(n):
            parent = elite[k % len(elite)]
            fallback = self._canned_child(parent, k, generation)
            if not self.use_fireworks:
                children.append(fallback)
                continue
            try:
                children.append(self._fireworks_child(parent, fallback, force_model_swap=k == 0))
            except Exception as exc:  # noqa: BLE001 - the feature flag must never break the demo floor
                children.append(
                    fallback.clone(
                        lineage_note=(
                            f"{fallback.lineage_note}; Fireworks unavailable "
                            f"({self._safe_error(exc)})"
                        )
                    )
                )
        return children

    # ------------------------------------------------------------------ #
    # Fireworks function-calling mutation
    # ------------------------------------------------------------------ #

    def _fireworks_child(
        self, parent: Variant, fallback: Genome, *, force_model_swap: bool
    ) -> Genome:
        """Ask Fireworks for one bounded mutation and apply it to the canned child.

        The model only sees the genome and its failure traces. It never receives the fitness
        implementation or grader-side task data.
        """
        from openai import OpenAI

        targets = ["prompt", "params", "model", *[f"tool:{p.case_id}" for p in self.task.problems]]
        tool = {
            "type": "function",
            "function": {
                "name": "propose_mutation",
                "description": "Return exactly one safe mutation for this agent genome.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target": {"type": "string", "enum": targets},
                        "new_content": {"type": "string"},
                        "lineage_note": {"type": "string"},
                    },
                    "required": ["target", "new_content", "lineage_note"],
                    "additionalProperties": False,
                },
            },
        }
        failures = [pc.model_dump() for pc in parent.per_case if pc.score < 1.0]
        model_instruction = (
            "This child must explore a different candidate model. Choose target 'model' with one "
            f"of: {', '.join(self.model_catalog)}."
            if force_model_swap
            else "You may mutate the prompt, one tool, params, or the model."
        )
        prompt = (
            "You improve a coding-agent genome. Return a function call only. "
            "Never propose grader, filesystem, network, or evaluation changes. "
            f"{model_instruction}\n"
            f"Candidate models: {', '.join(self.model_catalog)}\n"
            f"Genome: {fallback.model_dump_json()}\n"
            f"Failure traces: {json.dumps(failures)}"
        )
        client = OpenAI(
            api_key=self.config.fireworks_api_key,
            base_url=self.config.fireworks_base_url,
        )
        response = client.chat.completions.create(
            model=self.mutator_model,
            messages=[{"role": "user", "content": prompt}],
            tools=[tool],
            tool_choice={"type": "function", "function": {"name": "propose_mutation"}},
            temperature=0,
        )
        tool_calls = response.choices[0].message.tool_calls or []
        if not tool_calls:
            raise ValueError("Fireworks returned no mutation function call")
        proposal = json.loads(tool_calls[0].function.arguments)
        child = self._apply_proposal(fallback, proposal)

        # Model racing is load-bearing, not optional metadata: every Fireworks generation has
        # at least one candidate with a swapped model even if the model chose a tool rewrite.
        if force_model_swap and child.model == fallback.model:
            swapped = self._alternate_model(fallback.model)
            child = child.clone(
                model=swapped,
                lineage_note=f"{child.lineage_note}; explored model {swapped}",
            )
        return child

    def _apply_proposal(self, child: Genome, proposal: dict) -> Genome:
        target = proposal.get("target")
        content = proposal.get("new_content")
        note = proposal.get("lineage_note")
        if not isinstance(target, str) or not isinstance(content, str) or not isinstance(note, str):
            raise ValueError("Fireworks mutation has an invalid shape")
        if target == "prompt":
            return child.clone(system_prompt=content, lineage_note=note)
        if target == "params":
            params = json.loads(content)
            if not isinstance(params, dict) or not all(isinstance(v, (int, float)) for v in params.values()):
                raise ValueError("Fireworks params mutation must be a JSON object of numbers")
            return child.clone(params={k: float(v) for k, v in params.items()}, lineage_note=note)
        if target == "model":
            if content not in self.model_catalog:
                raise ValueError(f"Fireworks selected an unapproved model: {content}")
            return child.clone(model=content, lineage_note=note)
        if target.startswith("tool:"):
            problem_id = target.removeprefix("tool:")
            if problem_id not in child.tools:
                raise ValueError(f"Fireworks selected an unknown tool: {problem_id}")
            tools = dict(child.tools)
            tools[problem_id] = content
            return child.clone(tools=tools, lineage_note=note)
        raise ValueError(f"Fireworks selected an unsupported target: {target}")

    def _alternate_model(self, model: str) -> str:
        return next(candidate for candidate in self.model_catalog if candidate != model)

    @staticmethod
    def _safe_error(exc: Exception) -> str:
        """Keep enough API context for a demo diagnosis without persisting credentials."""
        message = str(exc).replace("\n", " ")
        message = re.sub(r"\b(?:sk|fw|dtn)_[A-Za-z0-9_-]+", "<redacted>", message)
        message = re.sub(r"(?i)(bearer\s+)[^\s,;]+", r"\1<redacted>", message)
        message = re.sub(r"(?i)(api[_ -]?key=)[^\s,;]+", r"\1<redacted>", message)
        return f"{type(exc).__name__}: {message[:240]}"

    # ------------------------------------------------------------------ #
    # Offline canned mutation
    # ------------------------------------------------------------------ #

    def _canned_child(self, parent: Variant, k: int, generation: int) -> Genome:
        targets = self._improvable_problems(parent)
        child_tools = dict(parent.genome.tools)
        note = "no improvable problem; carried forward"
        if targets:
            # Repair a small rotated batch so the documented five-generation offline run
            # reaches the demo threshold. Rotation still gives siblings distinct edits.
            start = k % len(targets)
            rotated = targets[start:] + targets[:start]
            changes = []
            for problem_id in rotated[:2]:
                ladder = self._ladders.get(problem_id, [])
                cur = child_tools.get(problem_id, "")
                idx = ladder.index(cur) if cur in ladder else 0
                if idx + 1 < len(ladder):
                    child_tools[problem_id] = ladder[idx + 1]
                    changes.append(f"{problem_id} ({idx} -> {idx + 1})")
            if changes:
                note = f"rewrote tool(s) {', '.join(changes)}"
        self._counter += 1
        return parent.genome.clone(
            genome_id=f"g{generation}-{self._counter}",
            generation=generation,
            parent_ids=[parent.genome.genome_id],
            tools=child_tools,
            lineage_note=note,
        )

    def _improvable_problems(self, parent: Variant) -> list[str]:
        """Problems the parent fails and whose ladder still has a better rung, worst first."""
        fails = self._fail_counts(parent)
        candidates = []
        for problem_id, fail_count in sorted(fails.items(), key=lambda kv: -kv[1]):
            if fail_count == 0:
                continue
            ladder = self._ladders.get(problem_id, [])
            cur = parent.genome.tools.get(problem_id, "")
            idx = ladder.index(cur) if cur in ladder else 0
            if idx + 1 < len(ladder):
                candidates.append(problem_id)
        return candidates

    @staticmethod
    def _fail_counts(parent: Variant) -> dict[str, int]:
        counts: dict[str, int] = {}
        for pc in parent.per_case:
            problem_id = pc.case_id.split("#", 1)[0]
            counts.setdefault(problem_id, 0)
            if pc.score < 1.0:
                counts[problem_id] += 1
        return counts
