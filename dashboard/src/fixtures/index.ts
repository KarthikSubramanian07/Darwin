// Fixture registry: the recorded library + an industry -> run resolver used by mock and
// recorded-demo modes. Legal services and Customer support are curated; anything else is
// generated deterministically so the demo never dead-ends on an unexpected industry.

import { buildRunDoc, type FixtureConfig, type ModelSpec } from "./builder";
import { customerSupportRun } from "./customerSupport";
import { legalServicesRun } from "./legalServices";
import { DEEPSEEK_V3, KIMI_K2, LLAMA_70B, QWEN_72B } from "./models";
import type { RunDoc, TaskInfo, TaskType } from "../types";

export { legalServicesRun, customerSupportRun };

/** Recorded/persisted runs shown in the previous-run library. */
export const RUN_LIBRARY: RunDoc[] = [legalServicesRun, customerSupportRun];

const GENERIC_MODELS: ModelSpec[] = [LLAMA_70B, QWEN_72B, DEEPSEEK_V3, KIMI_K2];

const GENERIC_TASK_TEMPLATES: Array<{ name: string; description: string; type: TaskType }> = [
  { name: "Document summarization", description: "Condense long source documents into accurate summaries.", type: "TEXT" },
  { name: "Field extraction", description: "Extract structured fields from unstructured records.", type: "STRUCTURED" },
  { name: "Classification", description: "Label records against a fixed rubric.", type: "STRUCTURED" },
  { name: "Reporting SQL", description: "Generate SQL that answers operational questions; executed for correctness.", type: "CODE" },
];

const slug = (s: string): string => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");

/** Deterministic generic run for an arbitrary industry (rotates winners so no model sweeps). */
export function generateGenericRun(industry: string): RunDoc {
  const tasks: TaskInfo[] = GENERIC_TASK_TEMPLATES.map((t, i) => ({
    id: `${slug(industry) || "task"}_${i}`,
    name: t.name,
    description: t.description,
    type: t.type,
    caseCount: t.type === "CODE" ? 8 : 10 + i,
  }));

  const scores: FixtureConfig["scores"] = {};
  const sandbox: NonNullable<FixtureConfig["sandbox"]> = {};
  tasks.forEach((task, ti) => {
    const winnerIdx = (ti + 2) % GENERIC_MODELS.length; // rotate the winner across tasks
    scores[task.id] = {};
    GENERIC_MODELS.forEach((m, mi) => {
      const base = 0.78 + ((ti * 3 + mi * 5) % 7) / 100; // 0.78..0.84 spread, deterministic
      scores[task.id][m.id] = Number((mi === winnerIdx ? 0.92 + (ti % 3) / 100 : base).toFixed(2));
    });
    if (task.type === "CODE") {
      sandbox[task.id] = {};
      GENERIC_MODELS.forEach((m, mi) => {
        sandbox[task.id][m.id] = { passed: mi === winnerIdx ? 8 : 4 + ((mi + ti) % 4), total: 8 };
      });
    }
  });

  return buildRunDoc({
    runId: `${slug(industry) || "run"}-${Date.now()}`,
    industry,
    createdAt: new Date().toISOString(),
    source: "mock",
    models: GENERIC_MODELS,
    tasks,
    scores,
    sandbox,
  });
}

/** Resolve an industry string to a recorded/mock run for replay. */
export function getRunForIndustry(industry: string, source: "recorded_demo" | "mock"): RunDoc {
  const q = industry.trim().toLowerCase();
  let doc: RunDoc | null = null;
  if (/legal|law|contract/.test(q)) doc = legalServicesRun;
  else if (/support|customer|service|help/.test(q)) doc = customerSupportRun;

  if (doc) {
    // Keep the curated content but honor the requested source + typed industry label.
    return {
      ...doc,
      summary: { ...doc.summary, source, industry: industry.trim() || doc.summary.industry },
    };
  }
  const generic = generateGenericRun(industry.trim() || "General operations");
  return { ...generic, summary: { ...generic.summary, source } };
}
