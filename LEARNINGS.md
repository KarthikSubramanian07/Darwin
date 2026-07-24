# LEARNINGS.md - what Lane C learned building the race (2026-07-24)

Ground-truth findings from live probes + current docs (Context7 / docs.fireworks.ai /
daytona.io / SDK source). Anything here that contradicts training-data intuition won, because
it was verified against the running services. Companion to DECISIONS.md D11/D12.

## Fireworks

- **The serverless catalog is tiny and recent.** `GET /v1/models` on the OpenAI-compatible
  endpoint returns just 6 models for this account: `gpt-oss-120b`, `kimi-k2p6`, `glm-5p1`,
  `glm-5p2`, `deepseek-v4-pro`, plus `flux-1-schnell-fp8` (image gen, excluded from the race).
  Fireworks removed legacy serverless models on **2026-05-14** (changelog): DeepSeek V3.x ->
  Kimi K2.6 / GLM 5.1, Qwen3 8B -> GPT-OSS 20B, Llama 3.3 70B -> GPT-OSS 120B. The repo's old
  default gene `llama-v3p1-8b-instruct` was long dead - anything pinned from memory would have
  404'd. Runtime catalog query + pinned fallback (`fw_client.RACE_MODELS`) handles drift.
- **Forced tool_choice is mandatory for the mutation call.** With plain `tools=[...]`,
  `kimi-k2p6` (temperature 0) answered in prose instead of calling the function;
  `tool_choice={"type": "function", "function": {"name": "rewrite_genome"}}` fixes it.
- **Models fill arguments loosely.** `gpt-oss-120b` put `add` in `target` where the schema
  wanted `tool:add`. Strict host-side validation of `{target, new_content}` with a canned
  fallback is not optional; the schema alone does not constrain behavior.
- **The live mutation is good and cheap.** One forced function call with real failure traces
  got a correct hash-map `two_sum` rewrite from `gpt-oss-120b`: 2.4-4.5s latency,
  ~$0.0003/call at $0.15/M in + $0.60/M out.
- **Pricing (per 1M tokens, fireworks.ai/models + docs/serverless/pricing, 2026-07-24):**
  gpt-oss-120b $0.15/$0.60 - kimi-k2p6 $0.95/$4.00 - glm-5p1 and glm-5p2 $1.40/$4.40 -
  deepseek-v4-pro $1.74 in / $3.48 blended (the docs table for this model reads garbled:
  "$0.145 output" next to a higher blended rate - we pinned in=$1.74/out=$3.48 as the
  conservative reading; cost figures are labeled estimates everywhere).
- **Billing truth is the response `usage` object** (`prompt_tokens`/`completion_tokens`),
  per docs - so `cost_est` is computed from usage, never from prompt length.
- **Live mutation p50 hit ~12.6s once real reasoning models were in the elite** (first full
  run) - far above the ~3s seen probing gpt-oss-120b alone. Sequential mutation of 6
  offspring = ~75s/generation, which blows the 2-minute budget and trips the 180s wall cap.
  Fix: offspring mutation calls now run concurrently (bounded by the client semaphore), so a
  generation's mutation cost is ~one p50 instead of n x p50.

## Braintrust (cross-lane, flagged to Lane B)

- **`experiment.summarize()` runs a server-side score/metric comparison per call** and it
  both blocked each variant's scoring thread and failed live with a Braintrust-side DB
  timeout ("Failed to run BrainstoreQuery ... Timed-out waiting to acquire database
  connection"). Verified in current docs (`/v1/experiment/{id}/summarize`): with
  `summarize_scores=false` only metadata is computed and `experiment_url` is still returned.
  `braintrust_logger.py` now calls `summarize(summarize_scores=False)` - one line, Lane B's
  file, flagged in the diff.

## Daytona

- **The Python SDK requires Python 3.10+** (its pydantic models use `X | None` evaluated at
  import time). The repo's stale 3.9 venv could not even import it; the project itself pins
  `>=3.11`. Rebuilt the venv with 3.11.9.
- **Verified surface** (live probe): `daytona.create()` (~350ms-2s cold start),
  `sandbox.fs.upload_file(bytes, remote_path)`, `sandbox.process.exec(cmd, cwd=, timeout=)`
  -> `.exit_code` / `.result` (stdout), `daytona.delete(sandbox)`. `python3` exists in the
  default image; no custom snapshot needed to run the harness.
- **Platform snapshots are experimental and slow for our cadence.** The per-sandbox API is
  literally `_experimental_create_snapshot` (captures the fs into object storage and polls a
  `snapshotting` state; restore means creating a NEW sandbox from the snapshot). At
  per-variant frequency that blows the 2-minute budget, so rollback uses in-sandbox
  directory snapshots (`cp -a`), mirroring the local reference pool exactly (DECISIONS D12).
- **One tarball beats many uploads.** A genome package is ~14 small files; uploading a single
  in-memory tar.gz + `tar xzf` in the sandbox costs one upload + one exec.
- **Reuse sandboxes across generations.** Creating 8 sandboxes once and wiping run dirs per
  run costs ~8 creations per demo instead of population x generations (~48).

## Bugs found in our own code

- **Rollback silently no-opped, even offline.** `guards._rollback` resolves handles via
  `pool.handle_by_id(...)` with a `getattr` default of "return None" - and `LocalSandboxPool`
  never had `handle_by_id`, so no variant ever reached `rolled_back` status. Fixed on both
  pools + regression test (`tests/test_rollback_local.py`). Lesson: a defensive `getattr`
  default can convert a missing method into invisible dead code.
- **A broad exception shield hid a real bug during development.** `_fireworks_child` wraps
  everything in `except Exception -> fall back to canned`, which is right for the demo but
  swallowed an `AttributeError` (`parent.genome_id` vs `parent.genome.genome_id`) during
  testing. Lesson: when a fallback path exists, test the happy path through the internals
  directly, not just through the shielded entry point.

## Live UI bridge (server <-> dashboard, 2026-07-24)

- **Sync engine -> async WebSocket needs one bridge pattern:** the engine emits synchronously
  from a daemon thread; each WS client owns an `asyncio.Queue` fed via
  `loop.call_soon_threadsafe`. The engine never touches the event loop
  (`darwin/server/app.py`).
- **Late-joiner snapshots have an ordering trap.** Capture-history-then-subscribe silently
  drops events emitted in between; subscribe-then-capture duplicates them instead. We
  subscribe first and dedupe by object identity (`emit` stores and forwards the same dict),
  which is exact and free at demo scale.
- **The replay page's "live" chip was dishonest** - it showed "● live" while playing the
  canned replay, which the SPEC's honesty rule explicitly forbids. Live mode now owns
  "● live"; the replay labels itself "replay" / "cached replay".
- **run.ts's sample data had fictional models** (llama-3.1-8b, qwen-2.5-coder, deepseek-v3)
  that were never in the live catalog; live mode renders engine truth (gpt-oss-120b et al.).
  The static race grid + routing card still show sample data - real per-task cells need
  multi-task runs (the industry mode) folded into a RoutingCard, which is still unbuilt.
- Verified end to end twice: a real-process uvicorn + websockets client (curve climbing over
  the socket), and in Chrome through the vite proxy - the "Run a live evolution" button drove
  a real engine run and the panels rendered engine truth.

## Toolchain footnotes

- `issubclass(X, Protocol)` raises `TypeError` when the protocol has non-method members
  (like `is_real_isolation: bool`) - protocol conformance tests must check the surface
  manually.
- `python-dotenv`'s `find_dotenv()` asserts on stack-frame introspection when code runs via
  stdin/heredoc; pass an explicit path (`load_dotenv(Path(".env"))`) in scripts.
