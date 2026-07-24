// Centralized mock model catalog.
//
// MOCK FIXTURE DATA. These are realistic Fireworks-style model ids, cost, and latency figures
// used for the recorded demo and mock development runs. They are NOT live measurements. When the
// real Fireworks catalog + measured cost/latency land from Lane C, replace this file (only the
// ids/labels/numbers here) and every fixture updates. See docs/LANE_D.md.

import type { ModelSpec } from "./builder";

export const LLAMA_70B: ModelSpec = {
  id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
  label: "Llama 3.3 70B",
  vendor: "Meta",
  costPer1k: 0.9,
  p50LatencyMs: 820,
};

export const QWEN_72B: ModelSpec = {
  id: "accounts/fireworks/models/qwen2p5-72b-instruct",
  label: "Qwen2.5 72B",
  vendor: "Alibaba",
  costPer1k: 0.9,
  p50LatencyMs: 900,
};

export const DEEPSEEK_V3: ModelSpec = {
  id: "accounts/fireworks/models/deepseek-v3",
  label: "DeepSeek V3",
  vendor: "DeepSeek",
  costPer1k: 0.9,
  p50LatencyMs: 1100,
};

export const KIMI_K2: ModelSpec = {
  id: "accounts/fireworks/models/kimi-k2-instruct",
  label: "Kimi K2",
  vendor: "Moonshot",
  costPer1k: 0.6,
  p50LatencyMs: 1300,
};

export const MIXTRAL_8X22B: ModelSpec = {
  id: "accounts/fireworks/models/mixtral-8x22b-instruct",
  label: "Mixtral 8x22B",
  vendor: "Mistral",
  costPer1k: 1.2,
  p50LatencyMs: 700,
};

export const LEGAL_MODELS: ModelSpec[] = [LLAMA_70B, QWEN_72B, DEEPSEEK_V3, KIMI_K2, MIXTRAL_8X22B];
