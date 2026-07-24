// Emits the bundled dashboard fixtures to data/runs/ as JSON so backend teammates and the
// previous-run library have an on-disk record. Run: npx vite-node scripts/dumpFixtures.ts
// The TS fixtures under src/fixtures/ remain the single source of truth; this only serializes them.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { customerSupportRun, legalServicesRun } from "../src/fixtures/index";
import type { RunDoc } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const runsDir = resolve(here, "../../data/runs");
mkdirSync(runsDir, { recursive: true });

const write = (name: string, doc: RunDoc): void => {
  const path = resolve(runsDir, name);
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`wrote ${path} (${doc.tasks.length} tasks x ${doc.models.length} models, ${doc.events.length} events)`);
};

// Named sample_*.json to match the repo's data/runs allowlist (see root .gitignore).
write("sample_legal-services.json", legalServicesRun);
write("sample_customer-support.json", customerSupportRun);
