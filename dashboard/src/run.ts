// Sample run that the dashboard replays. Honest: this is a labelled replay of a representative
// run, not live compute on the static page. Shapes mirror darwin/core/population.py so it can be
// swapped for a real RunRecord (data/runs/*.json) with no UI change.
//
// WIRING (kept in place): to show a real run, fetch a RunRecord JSON and map:
//   RunRecord.fitness_curve         -> CURVE
//   Generation.variants[]           -> POOL (id, gen, fitness, genome.model)
//   guard/mutation/champion events  -> EVENTS
//   Variant.braintrust_experiment_url -> deep link per row/cell
// The server (darwin/server/events.py) streams the same shapes over /ws for the live path.

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
  { id: "g0-6", gen: 0, fit: 0.3125, model: "llama-3.1-8b" },
  { id: "g1-1", gen: 1, fit: 0.5, model: "llama-3.1-8b" },
  { id: "g1-4", gen: 1, fit: 0.4375, model: "qwen-2.5-coder" },
  { id: "g1-7", gen: 1, fit: 0.4375, model: "llama-3.1-70b" },
  { id: "g2-1", gen: 2, fit: 0.625, model: "qwen-2.5-coder" },
  { id: "g2-3", gen: 2, fit: 0.5625, model: "qwen-2.5-coder" },
  { id: "g2-6", gen: 2, fit: 0.5, model: "deepseek-v3" },
  { id: "g3-2", gen: 3, fit: 0.75, model: "qwen-2.5-coder" },
  { id: "g3-4", gen: 3, fit: 0.6875, model: "deepseek-v3" },
  { id: "g4-1", gen: 4, fit: 0.875, model: "deepseek-v3" },
  { id: "g4-5", gen: 4, fit: 0.8125, model: "qwen-2.5-coder" },
  { id: "g5-2", gen: 5, fit: 1.0, model: "deepseek-v3" },
  { id: "g5-4", gen: 5, fit: 0.9375, model: "deepseek-v3" },
];

export type EventKind = "seed" | "champion" | "mutate" | "reject" | "block" | "eval";

export interface RunEvent {
  gen: number;
  kind: EventKind;
  text: string;
}

export const EVENTS: RunEvent[] = [
  { gen: 0, kind: "seed", text: "gen 0 seeded, 8 mediocre variants on llama-3.1-8b" },
  { gen: 0, kind: "eval", text: "evaluated 8 variants in 8 Daytona sandboxes, best 37.5%" },
  { gen: 1, kind: "mutate", text: "Fireworks proposed 6 mutations from the failure traces" },
  { gen: 1, kind: "champion", text: "new champion g1-1, 50%" },
  { gen: 2, kind: "mutate", text: "g2-1 rewrote tool two_sum and swapped to qwen-2.5-coder" },
  { gen: 2, kind: "eval", text: "evaluated 8 variants, 4 improved on their parent" },
  { gen: 2, kind: "champion", text: "new champion g2-1, 62.5%" },
  { gen: 3, kind: "reject", text: "regression g3-5 scored below its parent, sandbox rolled back" },
  { gen: 3, kind: "mutate", text: "g3-2 rewrote roman_to_int, kept qwen-2.5-coder" },
  { gen: 3, kind: "champion", text: "new champion g3-2, 75%" },
  { gen: 4, kind: "block", text: "canary g4-7 blocked, tried to import the grader" },
  { gen: 4, kind: "mutate", text: "g4-1 swapped to deepseek-v3 on the code tasks" },
  { gen: 4, kind: "champion", text: "new champion g4-1, 87.5%, deepseek-v3" },
  { gen: 5, kind: "eval", text: "final generation evaluated, all 16 cases passing" },
  { gen: 5, kind: "champion", text: "champion g5-2, 100%, solved, awaiting human sign-off" },
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
  { task: "is_palindrome", scores: [95, 90, 85, 88, 80], winner: 0 },
  { task: "fibonacci", scores: [60, 80, 100, 85, 70], winner: 2 },
  { task: "count_vowels", scores: [100, 90, 80, 85, 95], winner: 0 },
];

export function leaderboardAt(gen: number, k = 6): Genome[] {
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
