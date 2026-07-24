"""CodeRabbit integration — an independent AI reviewer of the code the agent writes about
ITSELF. Spans LANE B (safety gate) and LANE C (code-quality fitness).

Why it's load-bearing, not a bolt-on: Darwin is an AI that rewrites its own tool code. The
whole safety thesis is "you can trust a self-modifying agent if every self-modification is
contained, graded, and REVIEWED." CodeRabbit is the reviewer. It plays three roles:

  1. PROMOTION GATE (safety). Before a new champion is promoted, Darwin opens a real PR
     carrying the genome diff (the tool the agent rewrote in itself). CodeRabbit reviews it.
     A critical finding (unsafe exec, sandbox escape, an attempt to reach the grader,
     obfuscation) blocks promotion even if task fitness improved. The human veto becomes
     "merge the CodeRabbit-reviewed PR."

  2. CODE-QUALITY FITNESS (selection). CodeRabbit's findings become a penalty term folded
     into fitness, so evolution is pressured toward code a human would actually merge, not
     hacky code that merely passes. This is a second anti-reward-hacking layer on top of the
     immutable grader.

  3. MUTATION FEEDBACK (learning). CodeRabbit's structured comments join the failure-trace
     context handed to Fireworks for the next mutation, so the agent learns from code review
     generation over generation ("gen 2 fixed the injection CodeRabbit flagged in gen 1").

Two execution paths, feature-flagged:
  * FAST path (demo): CodeRabbit CLI / API reviews the genome diff inline.  VERIFY the CLI
    invocation + API surface at https://docs.coderabbit.ai before writing calls.
  * REAL path (wow): open an actual GitHub PR and read CodeRabbit's PR review. Slower;
    great for the "it's real on GitHub" beat.

If config.features.coderabbit is False, fall back to a local deterministic static-analysis
stub (flag exec/eval/network/grader-imports) with the SAME ReviewResult shape, so the loop
runs offline.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from darwin.config import Config
from darwin.core.genome import Genome

Severity = Literal["none", "info", "minor", "major", "critical"]


class ReviewFinding(BaseModel):
    file: str
    line: int | None = None
    severity: Severity = "info"
    message: str = ""


class ReviewResult(BaseModel):
    genome_id: str
    findings: list[ReviewFinding] = Field(default_factory=list)
    max_severity: Severity = "none"
    quality_penalty: float = 0.0  # 0..1, folded into fitness (role 2)
    blocks_promotion: bool = False  # True if a critical finding (role 1)
    pr_url: str | None = None  # set when the REAL PR path is used

    def as_mutation_feedback(self) -> str:
        """Render findings as text for the next Fireworks mutation (role 3). TODO."""
        raise NotImplementedError


class CodeReviewer:
    def __init__(self, config: Config):
        self.config = config
        self.use_coderabbit = config.features.coderabbit

    def review_genome(self, genome: Genome, parent: Genome | None = None) -> ReviewResult:
        """Review a genome's self-written tool code (diff vs parent when available).
        TODO(Lane B/C): CLI/API path + offline static-analysis fallback."""
        raise NotImplementedError

    def open_champion_pr(self, genome: Genome) -> str:
        """REAL path: open a GitHub PR with the genome diff for CodeRabbit to review; return
        the PR URL. Used by the human-veto beat. TODO(Lane B)."""
        raise NotImplementedError
