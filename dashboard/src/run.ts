// Sample run that the dashboard replays. Honest: this is a labelled replay of a representative
// run, not live compute on the static page. Shapes mirror darwin/core/population.py so it can be
// swapped for a real RunRecord (data/runs/*.json) with no UI change.

export const CURVE = [0.375, 0.5, 0.625, 0.75, 0.875, 1.0];
export const GENS = CURVE.length;

export interface Genome {
  id: string;
  gen: number;
  fit: number;
  model: string;
}

// discovered genomes; leaderboard = those found so far, ranked. The model gene swaps as it climbs.
export const POOL: Genome[] = [
  { id: "g0-0", gen: 0, fit: 0.375, model: "llama-3.1-8b" },
  { id: "g0-3", gen: 0, fit: 0.375, model: "llama-3.1-8b" },
  { id: "g1-1", gen: 1, fit: 0.5, model: "llama-3.1-8b" },
  { id: "g1-4", gen: 1, fit: 0.4375, model: "qwen-2.5-coder" },
  { id: "g2-1", gen: 2, fit: 0.625, model: "qwen-2.5-coder" },
  { id: "g3-2", gen: 3, fit: 0.75, model: "qwen-2.5-coder" },
  { id: "g3-5", gen: 3, fit: 0.6875, model: "deepseek-v3" },
  { id: "g4-1", gen: 4, fit: 0.875, model: "deepseek-v3" },
  { id: "g5-2", gen: 5, fit: 1.0, model: "deepseek-v3" },
];

export type EventKind = "seed" | "champion" | "mutate" | "reject" | "block";

export interface RunEvent {
  gen: number;
  kind: EventKind;
  text: string;
}

export const EVENTS: RunEvent[] = [
  { gen: 0, kind: "seed", text: "gen 0 seeded · 8 variants · 37.5%" },
  { gen: 1, kind: "champion", text: "new champion g1-1 · 50%" },
  { gen: 2, kind: "mutate", text: "g2-1 rewrote tool two_sum, swapped to qwen-2.5-coder" },
  { gen: 2, kind: "champion", text: "new champion g2-1 · 62.5%" },
  { gen: 3, kind: "reject", text: "regression g3-5 rejected, sandbox rolled back" },
  { gen: 3, kind: "champion", text: "new champion g3-2 · 75%" },
  { gen: 4, kind: "block", text: "canary g4-7 blocked, tried to read the grader" },
  { gen: 4, kind: "champion", text: "new champion g4-1 · 87.5% · deepseek-v3" },
  { gen: 5, kind: "champion", text: "champion g5-2 · 100% · solved" },
];

// the model race: tasks x models, best score per cell; winner index per task -> the routing card
export const MODELS = ["llama-8b", "llama-70b", "qwen-coder", "deepseek", "kimi"];
export interface RaceRow {
  task: string;
  scores: number[];
  winner: number;
}
export const RACE: RaceRow[] = [
  { task: "two_sum", scores: [40, 60, 100, 90, 70], winner: 2 },
  { task: "roman_to_int", scores: [50, 100, 80, 90, 60], winner: 1 },
  { task: "flatten", scores: [30, 70, 80, 100, 50], winner: 3 },
];

export function leaderboardAt(gen: number, k = 5): Genome[] {
  return POOL.filter((g) => g.gen <= gen)
    .sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id))
    .slice(0, k);
}

export function eventsUpTo(gen: number): RunEvent[] {
  return EVENTS.filter((e) => e.gen <= gen);
}

export function safeguardsFired(gen: number): number {
  return eventsUpTo(gen).filter((e) => e.kind === "reject" || e.kind === "block").length;
}
