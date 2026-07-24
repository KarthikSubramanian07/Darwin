# CodeRabbit on Darwin

Darwin is an AI that rewrites its own code, so independent review is a **safety component**, not a
style pass. CodeRabbit is on the repo from commit #1 and reviews every change — most importantly
the tool code the agent writes about itself.

## How it is enabled

- The GitHub app is installed on the repository; it auto-reviews pull requests.
- Behavior is configured in [`.coderabbit.yaml`](../.coderabbit.yaml) at the repo root.
- Champion promotions open a **draft PR** carrying the self-written genome diff; `auto_review.drafts`
  is on so review happens *before* promotion (the human-veto gate).
- Config is validated as part of review setup (parses as YAML; keys: `language`, `reviews`, `chat`).

## What reviewers (and CodeRabbit) look for

1. **Self-written tool code as untrusted** (`data/runs/**/genome_*/tools/**`): shell/exec/eval,
   network calls, filesystem escapes, any attempt to read or import the fitness/grader module,
   obfuscation, or reward-hacking the eval. A **critical finding blocks promotion** even if the
   task score went up.
2. **Frozen cross-lane contracts** (`darwin/core/genome.py`, `darwin/core/population.py`,
   `darwin/server/events.py`): flag any field rename/removal/type change or event-shape change,
   and require a matching `SPEC.md` §10 update in the same PR. These shapes are what every lane —
   and the dashboard — depend on.
3. **Lane isolation** (`dashboard/**`): changes stay inside the lane; no reaching into other lanes'
   Python from the dashboard; no hardcoded secrets; event handling adapts to the frozen backend
   contract rather than forking a second schema.

## Noise control

`reviews.path_filters` excludes generated and non-logic files so review budget goes to real code:
`node_modules/`, `dist/`, `*.min.js`, `*.map`, `dashboard/package-lock.json`, and
`data/runs/**/*.json` (persisted RunRecords + dashboard replay fixtures are data, not logic).

## How it supported the four-lane workflow

Four people worked four lanes in parallel against a set of frozen data shapes. CodeRabbit's
per-path instructions turned "don't break the shared contract" from a Slack reminder into an
automated review signal: a rename in `population.py` or an event-key change in `events.py` gets
flagged on the PR, before it can break Lane D's adapter or Lane C's engine. On the safety side it
is the second anti-reward-hacking layer on top of the immutable grader, and the concrete artifact
behind the "a human still signs off on every champion" claim.

> Note: this document describes configuration and intent. It does not assert any specific review
> outcome — real findings live on the PRs.
