// MOCK FIXTURE: a second recorded run (Customer support) so the previous-run library has more
// than one entry. Smaller: four tasks, four models. Winners again differ per task.

import { buildRunDoc, type FixtureConfig } from "./builder";
import { DEEPSEEK_V3, KIMI_K2, LLAMA_70B, QWEN_72B } from "./models";
import type { ModelSpec } from "./builder";
import type { RunDoc, TaskInfo } from "../types";

const MODELS: ModelSpec[] = [LLAMA_70B, QWEN_72B, DEEPSEEK_V3, KIMI_K2];

const TASKS: TaskInfo[] = [
  {
    id: "intent_classification",
    name: "Intent classification",
    description: "Route an inbound ticket to the correct queue from a fixed taxonomy.",
    type: "STRUCTURED",
    caseCount: 12,
  },
  {
    id: "reply_drafting",
    name: "Reply drafting",
    description: "Draft an on-brand, policy-compliant response to a customer message.",
    type: "TEXT",
    caseCount: 10,
  },
  {
    id: "sentiment_tagging",
    name: "Sentiment tagging",
    description: "Tag message sentiment and escalation risk against a rubric.",
    type: "STRUCTURED",
    caseCount: 10,
  },
  {
    id: "kb_sql",
    name: "Analytics SQL",
    description: "Write SQL for support-volume analytics; executed for correctness.",
    type: "CODE",
    caseCount: 8,
  },
];

const S = {
  intent_classification: {
    [LLAMA_70B.id]: 0.9,
    [QWEN_72B.id]: 0.93, // winner
    [DEEPSEEK_V3.id]: 0.88,
    [KIMI_K2.id]: 0.85,
  },
  reply_drafting: {
    [LLAMA_70B.id]: 0.87,
    [QWEN_72B.id]: 0.84,
    [DEEPSEEK_V3.id]: 0.86,
    [KIMI_K2.id]: 0.92, // winner
  },
  sentiment_tagging: {
    [LLAMA_70B.id]: 0.89, // winner
    [QWEN_72B.id]: 0.86,
    [DEEPSEEK_V3.id]: 0.83,
    [KIMI_K2.id]: 0.81,
  },
  kb_sql: {
    [LLAMA_70B.id]: 0.72,
    [QWEN_72B.id]: 0.79,
    [DEEPSEEK_V3.id]: 0.9, // winner, Daytona-verified
    [KIMI_K2.id]: 0.68,
  },
};

const SANDBOX = {
  kb_sql: {
    [LLAMA_70B.id]: { passed: 5, total: 8 },
    [QWEN_72B.id]: { passed: 6, total: 8 },
    [DEEPSEEK_V3.id]: { passed: 8, total: 8 },
    [KIMI_K2.id]: { passed: 4, total: 8 },
  },
};

const config: FixtureConfig = {
  runId: "customer-support-2026-07-23",
  industry: "Customer support",
  createdAt: "2026-07-23T16:12:00Z",
  source: "previously_computed",
  models: MODELS,
  tasks: TASKS,
  scores: S,
  sandbox: SANDBOX,
};

export const customerSupportRun: RunDoc = buildRunDoc(config);
