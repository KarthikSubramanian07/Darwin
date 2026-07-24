# Lane C Plan — Parallel Model Race + Daytona Sandbox Execution

**Owner:** Dean Orenstein (Lane C, `lane-c` branch)  
**Scope:** `darwin/core/engine.py`, `darwin/core/mutate.py`, `darwin/sandbox/*`, `darwin/safety/guards.py`, `data/runs/`  
**Goal:** Make the model race real (genome seeding across Fireworks catalog), implement Daytona sandbox execution with snapshot/rollback, and deliver 5+ dry-runs under 2 minutes, with 3+ precomputed `RunRecord`s for the honest library.  
**Grounded in:** SPEC.md §5, §11, §14, DECISIONS.md D1–D5, verified SDK surfaces (2026-07-24), CONTRIBUTING.md lane map.

---

## Context: What We Found

The repo's shapes are frozen, the engine loop is done, and Lane B's Braintrust fitness landed. What's missing on Lane C:

1. **Dead code in sandbox/daytona.py:** stub that predates the `SandboxPool` protocol; doesn't match `main.py`'s import expectations.
2. **Stale DEFAULT_MODEL:** `llama-v3p1-8b-instruct` in `genome.py:23` was removed from Fireworks serverless on **May 14, 2026**. Docs finding: Llama 3.3 70B → GPT-OSS 120B, Qwen3 8B → GPT-OSS 20B, DeepSeek V3.1/V3.2 → Kimi K2.6 / GLM 5.1 (verified via Context7, docs.fireworks.ai/updates/changelog).
3. **No Fireworks mutation path:** Phase 3 doesn't exist; gen-0 seeds 8 identical models (no race).
4. **Cost/latency fields exist but empty:** `Variant.cost_est` and `Variant.p50_latency_ms` are defined but never populated.
5. **Rollback bug:** `LocalSandboxPool` has no `handle_by_id`, so `guards._rollback` silently no-ops even offline. `Variant.status` never becomes `"rolled_back"`.
6. **Empty data/runs/:** precomputed library is missing.

### Verified SDK Surfaces (DECISIONS D5, 2026-07-24)

**Fireworks OpenAI-compatible:**
- Base URL: `https://api.fireworks.ai/inference/v1`
- Chat completions + function-calling: standard `tools=[{"type":"function", "function":{...}}]` format
- Live catalog query: `client.models.list(filter="supports_serverless=true")`

**Daytona Python SDK:**
- `Daytona()` from `daytona` package; reads `DAYTONA_API_KEY`
- Create: `daytona.create(CreateSandboxFromSnapshotParams(...))` → ephemeral sandbox, sub-90ms cold start
- Exec: `sandbox.process.exec('python harness.py')` → returns `{result, stdout, stderr}`
- Snapshot: `daytona.snapshot.create(CreateSnapshotParams(...))` per sandbox; containers (no memory snapshot)
- Rollback: re-create sandbox from snapshot (container primitive)

---

## Task DAG

```
                         C0: Pin live model catalog + smoke (#1)
                        /                              \
        C1: Fireworks client (#2)              C4: DaytonaSandboxPool (#5)
        semaphore/retry/cost                       |          \
             |                                      |           \
        C2: Function-calling mutation (#3)    C6: Real-exec   C7: Rollback demo (#8)
        (model-swap gene)                      scoring (#7)        |
             |                                     |           C5: Fix handle_by_id (#6)
        C3: Race seeding + cost/latency (#4)      |          (independent - no deps)
             \                                    /
              \                                  /
               C8: End-to-end race < 2 min (#9)
                          |
               C9: Precompute library (#10)

               C10: Tests + docs green (#11) — continuous gate on every PR
```

### Dependencies

- **C5 (handle_by_id):** no dependencies; can land immediately as a small PR.
- **Fireworks track:** C0 → C1 → C2 → C3 → C8 → C9
- **Daytona track:** C0 → C4 → (C6, C7 in parallel) → C8 → C9
- **C10:** gates every PR; not a terminal node.

---

## Tasks

### C0: Pin Live Fireworks Serverless Model Catalog + Smoke Both SDKs

**Acceptance:**
- Query the live Fireworks serverless catalog via `client.models.list(filter="supports_serverless=true")` OR the OpenAI-compatible `/v1/models` endpoint.
- Pin 5–8 current model ids (e.g., GPT-OSS 20B/120B, Kimi K2.6, GLM 5.1, DeepSeek V3.2). Include pricing (input/output tokens/M) for `cost_est` calculations.
- Daytona smoke test: `Daytona()` → create sandbox → `process.exec("python -V")` → `fs` upload test file → close. (5 lines.)
- Record pinned ids, pricing table, and rollback choice in **DECISIONS.md D11**.
- **Blocker for:** C1, C4

**Why first:** Ground truth. Catalog can drift; SDK surfaces change. This unblocks everything downstream.

---

### C5: Fix Rollback Plumbing — `handle_by_id` on `LocalSandboxPool`

**Status:** Independent; no dependencies.

**The bug:** `guards._rollback` resolves handles via `getattr(self.sandboxes, "handle_by_id", ...)` but `LocalSandboxPool` has no such method. Rollback silently no-ops even offline, and `Variant.status` never becomes `"rolled_back"`.

**Acceptance:**
- Add `handle_by_id(sandbox_id: str) -> LocalHandle | None` to `LocalSandboxPool` (maps `sandbox_id` to its cached handle, or returns `None`).
- Unit test: seeded regressing variant → `guards.filter` → `status == "rolled_back"` and workdir restored from snapshot.
- Offline path must produce `rolled_back` status consistently.

**Why now:** Quick win. Unblocks the rollback demo beat (C7) and makes the demo floor reliable.

---

### C1: Fireworks Client Infrastructure (Semaphore, Retry/Backoff, Latency + Cost Capture)

**Acceptance:**
- New module `darwin/core/fw_client.py`: OpenAI-compatible client with concurrency semaphore (configurable burst limit, defaults to 4–8 concurrent calls) + exponential backoff retry on 429/5xx (SPEC §8 flags burst limits as a top risk).
- Every `chat.completions.create` captures: wall latency (ms), input/output tokens used, cost estimate (tokens × pricing from C0 table).
- Returns a dict: `{response, latency_ms, cost_est, tokens_in, tokens_out}`.
- Feature-flagged: importable and no-op when `FEATURE_FIREWORKS=0` or API key missing.
- Unit tests: mocked transport, semaphore slots, retry exponential backoff.
- **Blocker for:** C2, C3

**Why structured:** The mutation engine runs N models × M generations = O(10–100) API calls. Semaphore + backoff are not optional; burst limits are cited explicitly as a demo-stage risk.

---

### C2: Fireworks Function-Calling Mutation Path in `mutate.py` (Model Swap Included)

**Phase:** Phase 3 (SPEC §11).

**Acceptance:**
- Behind `FEATURE_FIREWORKS`, the mutator calls Fireworks once per offspring (via fw_client from C1) with function-calling interface.
- Tool definition (JSON): one function `"rewrite_genome"` returning `{target, new_content, lineage_note}` where `target ∈ {prompt, tool:<name>, params, model}`.
- Prompt context = parent's failure traces (assertions that failed, from `Variant.per_case`) + CodeRabbit findings (when available, Phase 4). Never receives the grader code (DECISIONS D3; `tests/test_immutable_grader.py` stays green).
- **Model swap:** if `target == "model"`, `new_content` is a live model id from the C0 pinned catalog; mutator verifies it's in the catalog before returning.
- Fallback: on any API error / timeout / malformed response, emit a debug log and return a canned-ladder child (the offline mutation path). The loop never stalls.
- Logs: calls-per-generation, p50 latency per generation (Phase 3 acceptance: "calls-per-gen + p50 latency logged").
- **Blocker for:** C3

**HARD RULE:** The mutator only ever receives a `Genome`, never `fitness.py`. It cannot reach the grader by construction.

---

### C3: Model-Race Seeding + Cost/Latency Threading into `Variant`/Events

**Acceptance:**
- **Gen-0 seeding:** instead of 8 identical `DEFAULT_MODEL` clones, seed across the C0 pinned catalog. E.g., if 8 models and pop_size=8, each model appears once; if 6 models and pop_size=8, round-robin. (Minimal diff in `engine.py`; CONTRIBUTING: "keep diffs minimal, Lane A's loop is sacred.")
- **Variant threading:** every variant's `cost_est` and `p50_latency_ms` are populated from the Fireworks call stats (C1 capture).
- **Events:** `variant_evaluated` and `generation_complete` payloads include `model`, `cost_est`, `p50_latency_ms` so Lane D's task×model grid and routing-card can visualize the race.
- **Shape updates:** if any field is added/renamed, update SPEC §10 in the same PR.
- **Blocker for:** C8

**Why:** The race is the headline. Without seeding across models, there's no race—just one model winning every time.

---

### C4: `DaytonaSandboxPool` — Real Pool, Parallel Acquire, Snapshot/Restore

**Acceptance:**
- Rewrite `darwin/sandbox/daytona.py` (currently a stub). Implement the full `SandboxPool` protocol from `base.py`:
  - `acquire(n)` → concurrently create n sandboxes via `Daytona()` (ephemeral=True for auto-cleanup). Returns handles immediately; pool stays open for reuse in later generations.
  - `run_genome(handle, genome, inputs_spec)` → `genome.to_files(tmpdir)`, upload via `sandbox.fs` or `process.exec("cat > ...")`, write `inputs.json` and `harness.py`, run `sandbox.process.exec("python harness.py")`, parse `stdout` with `parse_result()` (from `harness.py`; mirroring `local.py` exactly).
  - `snapshot(handle)` → POST `/sandboxes/{id}/snapshots`; return snapshot id.
  - `restore(handle, snap_id)` → re-create sandbox from snapshot (container rollback primitive; record as DECISIONS D12).
  - `handle_by_id(sandbox_id)` → look up a handle by id (needed by `guards._rollback`).
  - `close()` → destroy all sandboxes.
  - `is_real_isolation = True`.
- Semantics: timeout → per-case error dicts (same shape as `local.py`), crash → stderr tail capped at 500 chars.
- Feature-flagged: when `FEATURE_DAYTONA=0` or import fails, gracefully fall back to `LocalSandboxPool` in `main.py`.
- Mirror `local.py` exactly so behavior is deterministic and comparable.
- **Blocker for:** C6, C7, C8

**Why rewrite:** The stub doesn't implement the protocol; it can't run. Daytona is the load-bearing containment pillar.

---

### C6: Real-Execution Scoring Verified in a Daytona Sandbox

**Acceptance:**
- With `FEATURE_DAYTONA=1`, run `coding_bench` end-to-end and verify:
  - Outputs come from harness execution in a remote sandbox (check `RunRecord.config.real_isolation == True`).
  - Per-case scores from Daytona runs match the offline local-pool run for the same genome (determinism check).
  - Wall-clock time per generation is acceptable (no timeout, sub-5s typical).
  - Pre-warm the sandbox pool if start-up latency is visibly blocking (record in DECISIONS D12).
- This is verification + tuning, not new features.

**Why:** Code tasks scored on real execution (not opinion) is a headline acceptance beat (SPEC §5 Lane C done-when).

---

### C7: Rollback-on-Screen Demo Beat (Seeded Bad Mutation)

**Acceptance:**
- Implement a seeded-regression canary: a flag or mutator hook that emits one deliberately regressing child (e.g., a broken tool code) in generation N.
- With `FEATURE_DAYTONA=1`, run the task, watch the mutation be rejected by `guards.filter`, its Daytona sandbox restored from snapshot, and the sequence of events fire: `variant_evaluated` (low fitness) → `generation_complete` → `regression_rejected` + `rolled_back` guard events.
- Verify this reproduces reliably 5+ times (it's the demo beat at 1:40 in SPEC §7).
- Dashboard receives the guard events and renders them on the safeguards strip (Lane D integration; events already exist per SPEC §10 Event contract).

**Why:** The safety pillar must be visible. "It cannot escape the sandbox, and it can't cheat its grader" is the close.

---

### C8: End-to-End Race Under 2 Minutes → `RunRecord`

**Acceptance:**
- Run `coding_bench` (or a Lane-A-supplied task when available; not a blocker) with all three sponsor flags on (`FEATURE_DAYTONA=1, FEATURE_FIREWORKS=1, FEATURE_BRAINTRUST=1`).
- Wall-clock time per run: **under 2 minutes** (SPEC §3 "live run = one task or one small industry, small enough to finish in ~2 minutes on stage").
- Monotonic fitness curve (elitism): best_fitness never decreases. Climb from ~40% to 90%+ over 4–6 generations.
- 5+ clean dry-runs with consistent behavior (timing, climb shape, no timeouts/crashes).
- Every variant has: `cost_est` (Fireworks), `p50_latency_ms` (Fireworks), `braintrust_experiment_url` (Braintrust).
- Final `RunRecord` written to disk via `persist()`.
- Tune `POPULATION_SIZE`, `GENERATIONS`, `ELITE_K`, Fireworks semaphore width, and sandbox pre-warm against real burst limits + venue WiFi expectations.

**Why:** This is the headline. If the race doesn't run end-to-end in 2 minutes, the demo floor doesn't exist.

---

### C9: Precompute the Honest Library — 3+ `RunRecord`s in `data/runs/`

**Acceptance:**
- With C8 stable, pre-compute 3+ `RunRecord`s and persist them in `data/runs/` with a meaningful naming scheme (e.g., `run-seed-1337-{task}-{timestamp}.json`, `run-seed-1338-{task}-{timestamp}.json`).
- Fallback for now: if Lane A's industries aren't ready, run multiple seeds/config variations of `coding_bench` (e.g., `RANDOM_SEED=1337, 1338, 1339`), honestly labeled.
- Every run must carry real data (no fakes). Each is shown with an explicit "cached" badge in the dashboard (SPEC §3 honesty rule: "Never present a cached run as live").
- These are the dashboard's library and the Cloudflare Pages replay payload (SPEC §17).

**Why:** The fallback for venue WiFi. Pre-computed runs are honest insurance.

---

### C10: Tests + Docs Green Per PR (Continuous Gate)

**Not a terminal node.** Gates every Lane C PR.

**Tests:**
- New tests:
  - `test_fw_client.py`: semaphore slot management, retry exponential backoff (mocked).
  - `test_mutation_fireworks.py`: function-calling request shape, model-swap target, fallback-on-error (stays monotonic).
  - `test_daytona_pool.py`: flag-off no-op import, basic acquire/run_genome/snapshot/restore semantics (use a real Daytona key or mock).
  - `test_local_rollback.py`: `handle_by_id`, seeded regressing variant → status == "rolled_back".
- Existing must stay green:
  - `test_engine_climb.py`: offline monotonic climb (the demo floor, all flags off).
  - `test_immutable_grader.py`: mutator never touches fitness.
  - `test_shapes.py`: Pydantic models serialize/deserialize.
  - `test_fitness.py`, `test_scorers.py`, `test_config.py`.

**Docs:**
- SPEC §10 (Data shapes): update `Variant` field descriptions if any change.
- SPEC §14 (Verified SDK surfaces): confirm Daytona + Fireworks surfaces are current.
- DECISIONS.md:
  - **D11** (new): Fireworks verified surface (base URL, function-calling format, pinned serverless model ids, pricing table).
  - **D12** (new): Daytona rollback = container re-create-from-snapshot. VM sandboxes support fork/pause-resume but we use containers for simplicity (or flip this if you confirm VMs are faster/cheaper).
- CONTRIBUTING.md: no changes (lane map is stable).
- Code comments: fix stale `DEFAULT_MODEL` reference in `genome.py:23`; add a comment in `mutate.py` linking to DECISIONS D3 (immutable grader) for future readers.

---

## Cross-Lane Coordination

- **Lane A** (task decomposition + synthetic data) will produce `pipeline/decompose.py` and tasks beyond `coding_bench`. We race `coding_bench` for now; no blocker.
- **Lane B** (Braintrust eval) has landed. We consume the fitness scores; they consume our Variant shape (which is stable).
- **Lane D** (dashboard) consumes events and `RunRecord`s. Our event payloads (C3) will light up the task×model grid. The dashboard renders the cached-run library (C9 precomputed `RunRecord`s).

---

## Timeline (Suggested Pacing)

| Phase | Work | Estimated | Dependencies |
|---|---|---|---|
| **Day 1 morning** | C5 (handle_by_id fix) + C0 (pin catalog, smoke tests) | 1–2 hours | API keys in `.env` |
| **Day 1 afternoon** | C1 (Fireworks client) + C4 (Daytona pool in parallel) | 3–4 hours | C0 output (model ids, pricing) |
| **Day 1 EOD** | C2 (Fireworks mutation) + start C6 (real-exec verify) | 2–3 hours | C1 + C4 |
| **Day 2 morning** | C3 (race seeding + events) + C7 (rollback demo) | 2–3 hours | C2 done |
| **Day 2 afternoon** | C8 (end-to-end tune, 5+ dry-runs) | 2–3 hours | C3 + C4 done |
| **Day 2 EOD** | C9 (precompute library) + C10 (tests + docs) | 1–2 hours | C8 done |

**Parallel tracks:** Fireworks (C1→C2→C3) and Daytona (C4→C6/C7) can run simultaneously after C0.

---

## Quick-Start Commands

```bash
# Prepare
git checkout lane-c
cp .env.example .env
# Fill in DAYTONA_API_KEY, FIREWORKS_API_KEY, BRAINTRUST_API_KEY

# Run tests (offline, no keys needed)
pytest -q

# Run lint
ruff check .

# Run an offline demo (all flags off, local sandbox, canned mutations)
python -m darwin.main --offline --echo

# Claim a task
task update 1 --status in_progress  # e.g., start C0

# Mark done
task update 1 --status completed
task list  # see what's unblocked next
```

---

## References

- **SPEC.md:** §3 (scope), §5 (Lane C), §8 (risks), §11 (Sandbox contract), §14 (verified surfaces), §19 (acceptance).
- **DECISIONS.md:** D1 (elitism), D2 (feature flags), D3 (immutable grader), D5 (verified surfaces 2026-07-24).
- **CONTRIBUTING.md:** lane map, cross-lane rules.
- **Code:** `darwin/core/engine.py` (the sacred path), `darwin/sandbox/base.py` (protocol), `darwin/sandbox/local.py` (reference implementation).

---

## Success Criteria (End of Lane C)

✅ **Phase 1 (Daytona):** Real pool, snapshot/restore, parallel eval, bad mutation rolled back on screen.  
✅ **Phase 2 (Braintrust):** Every variant tagged + experiment url + offline before/after.  
✅ **Phase 3 (Fireworks):** Function-calling mutation beats random baseline, model swaps, calls/gen logged, cost + latency captured.  
✅ **Phase 5 (demo ready):** 5+ reliable dry-runs, monotonic curve, under 2 minutes, 3+ precomputed `RunRecord`s, tests green, docs updated, rollback visible on screen.

