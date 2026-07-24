// Ordering + geometry math for the score landscape, kept out of the component so it is
// unit-testable in the node-env vitest project.
//
// The landscape plots score over task x model. BOTH axes are nominal (unordered), so the
// shape of a landscape is only meaningful once the axes are ordered by something in the data
// itself -- otherwise its ridges and valleys are artifacts of whatever order the fixtures
// happened to use. We seriate both axes by marginal mean score (descending), which is the
// standard treatment for matrix displays and makes the surface read as a dominance gradient.
//
// Seriation is applied ONLY once a run is complete. Re-ordering mid-race would make columns
// jump around as results land, implying movement that isn't in the data.

import { pickWinner } from "./routing";
import type { CellState, ModelInfo, RaceResult, TaskInfo } from "../types";
import { cellKey } from "../types";

export interface LandscapeColumn {
  key: string;
  taskId: string;
  modelId: string;
  taskName: string;
  modelLabel: string;
  /** 0..1 once the cell is complete; null while it is still queued/running/failed. */
  score: number | null;
  state: CellState;
  winner: boolean;
  col: number; // x index, model axis
  row: number; // z index, task axis
}

export interface Landscape {
  columns: LandscapeColumn[];
  tasks: TaskInfo[];
  models: ModelInfo[];
  /** Mean of the per-task winning scores, or null before anything completes. */
  winnerMean: number | null;
}

/** Mean score over complete cells matching a predicate; null when nothing has landed yet. */
export function meanScore(results: RaceResult[]): number | null {
  const complete = results.filter((r) => r.state === "complete");
  if (complete.length === 0) return null;
  return complete.reduce((sum, r) => sum + r.score, 0) / complete.length;
}

/**
 * Order categories by marginal mean score, descending. Deterministic: ties and
 * categories with no complete cells keep their original relative order, and the
 * latter sort to the end.
 */
export function seriate<T extends { id: string }>(
  items: T[],
  meanOf: (id: string) => number | null,
): T[] {
  return items
    .map((item, index) => ({ item, index, mean: meanOf(item.id) }))
    .sort((a, b) => {
      if (a.mean === null && b.mean === null) return a.index - b.index;
      if (a.mean === null) return 1;
      if (b.mean === null) return -1;
      return b.mean - a.mean || a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * Build the plotted columns. `seriated` should be true only for a finished run; while racing
 * the natural fixture order is kept so nothing moves under the viewer.
 */
export function buildLandscape(
  tasks: TaskInfo[],
  models: ModelInfo[],
  cells: Record<string, RaceResult>,
  seriated: boolean,
): Landscape {
  const cellsFor = (predicate: (r: RaceResult) => boolean): RaceResult[] =>
    Object.values(cells).filter(predicate);

  const taskOrder = seriated
    ? seriate(tasks, (id) => meanScore(cellsFor((r) => r.taskId === id)))
    : tasks;
  const modelOrder = seriated
    ? seriate(models, (id) => meanScore(cellsFor((r) => r.modelId === id)))
    : models;

  const winnerByTask = new Map<string, string>();
  const winningScores: number[] = [];
  for (const task of taskOrder) {
    const row = modelOrder
      .map((m) => cells[cellKey(task.id, m.id)])
      .filter((c): c is RaceResult => Boolean(c));
    const winner = pickWinner(row);
    if (winner) {
      winnerByTask.set(task.id, winner.modelId);
      winningScores.push(winner.score);
    }
  }

  const columns: LandscapeColumn[] = [];
  taskOrder.forEach((task, row) => {
    modelOrder.forEach((model, col) => {
      const key = cellKey(task.id, model.id);
      const cell = cells[key];
      const state: CellState = cell?.state ?? "queued";
      columns.push({
        key,
        taskId: task.id,
        modelId: model.id,
        taskName: task.name,
        modelLabel: model.label,
        score: cell && state === "complete" ? cell.score : null,
        state,
        winner: winnerByTask.get(task.id) === model.id && state === "complete",
        col,
        row,
      });
    });
  });

  return {
    columns,
    tasks: taskOrder,
    models: modelOrder,
    winnerMean:
      winningScores.length > 0
        ? winningScores.reduce((s, v) => s + v, 0) / winningScores.length
        : null,
  };
}
