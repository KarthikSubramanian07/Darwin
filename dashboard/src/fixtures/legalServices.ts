// MOCK FIXTURE: a complete recorded Legal services run. Five real legal tasks raced across five
// models, scored on eval cases, with the SQL task executed in Daytona. The winners are
// deliberately different per task (Kimi / Qwen / DeepSeek / Llama / DeepSeek) so the routing
// story is honest: no single model wins every row.

import { buildRunDoc, type FixtureConfig } from "./builder";
import { DEEPSEEK_V3, KIMI_K2, LEGAL_MODELS, LLAMA_70B, MIXTRAL_8X22B, QWEN_72B } from "./models";
import type { RunDoc, TaskInfo } from "../types";

const TASKS: TaskInfo[] = [
  {
    id: "contract_summary",
    name: "Contract summarization",
    description: "Condense a full agreement into an accurate executive summary with key terms.",
    type: "TEXT",
    caseCount: 12,
  },
  {
    id: "clause_extraction",
    name: "Clause extraction",
    description: "Pull indemnity, liability, and termination clauses into a structured schema.",
    type: "STRUCTURED",
    caseCount: 10,
  },
  {
    id: "citation_verification",
    name: "Citation verification",
    description: "Check that cited cases and statutes exist and support the stated proposition.",
    type: "STRUCTURED",
    caseCount: 10,
  },
  {
    id: "risk_classification",
    name: "Risk classification",
    description: "Label each clause low / medium / high risk against a fixed rubric.",
    type: "STRUCTURED",
    caseCount: 12,
  },
  {
    id: "sql_reporting",
    name: "SQL reporting",
    description: "Generate SQL that answers matter-management questions; executed for correctness.",
    type: "CODE",
    caseCount: 8,
  },
];

// scores[taskId][modelId] — hand-tuned so each task has a distinct, defensible winner.
const S = {
  contract_summary: {
    [LLAMA_70B.id]: 0.86,
    [QWEN_72B.id]: 0.83,
    [DEEPSEEK_V3.id]: 0.88,
    [KIMI_K2.id]: 0.94, // winner
    [MIXTRAL_8X22B.id]: 0.79,
  },
  clause_extraction: {
    [LLAMA_70B.id]: 0.88,
    [QWEN_72B.id]: 0.95, // winner
    [DEEPSEEK_V3.id]: 0.9,
    [KIMI_K2.id]: 0.84,
    [MIXTRAL_8X22B.id]: 0.8,
  },
  citation_verification: {
    [LLAMA_70B.id]: 0.82,
    [QWEN_72B.id]: 0.85,
    [DEEPSEEK_V3.id]: 0.93, // winner
    [KIMI_K2.id]: 0.79,
    [MIXTRAL_8X22B.id]: 0.77,
  },
  risk_classification: {
    [LLAMA_70B.id]: 0.91, // winner
    [QWEN_72B.id]: 0.87,
    [DEEPSEEK_V3.id]: 0.85,
    [KIMI_K2.id]: 0.83,
    [MIXTRAL_8X22B.id]: 0.84,
  },
  sql_reporting: {
    [LLAMA_70B.id]: 0.75,
    [QWEN_72B.id]: 0.8,
    [DEEPSEEK_V3.id]: 0.92, // winner, Daytona-verified
    [KIMI_K2.id]: 0.7,
    [MIXTRAL_8X22B.id]: 0.78,
  },
};

// Daytona execution outcomes for the CODE task (passed / total hidden tests).
const SANDBOX = {
  sql_reporting: {
    [LLAMA_70B.id]: { passed: 5, total: 8 },
    [QWEN_72B.id]: { passed: 6, total: 8 },
    [DEEPSEEK_V3.id]: { passed: 8, total: 8 },
    [KIMI_K2.id]: { passed: 4, total: 8 },
    [MIXTRAL_8X22B.id]: { passed: 6, total: 8 },
  },
};

const config: FixtureConfig = {
  runId: "legal-services-2026-07-24",
  industry: "Legal services",
  createdAt: "2026-07-24T09:41:00Z",
  source: "recorded_demo",
  models: LEGAL_MODELS,
  tasks: TASKS,
  scores: S,
  sandbox: SANDBOX,
  braintrustMissing: [MIXTRAL_8X22B.id], // Mixtral rows show the honest "no experiment link" path
};

export const legalServicesRun: RunDoc = buildRunDoc(config);
