// Screen 3, the hero: the task x model race grid. Rows are tasks, columns are models. Each cell
// walks through real states (queued -> running -> scoring -> [executing] -> complete/failed).
// Completed cells show the score big and legible; the row winner gets a clear ring. Kept
// deliberately calm elsewhere so the winners read from across a room.

import { useMemo } from "react";
import { pickWinner } from "../lib/routing";
import { pct } from "../lib/format";
import type { CellState, ModelInfo, RaceResult, TaskInfo } from "../types";
import { cellKey } from "../types";
import { TaskTypeBadge } from "./Decomposition";

const STATE_LABEL: Record<CellState, string> = {
  queued: "Queued",
  running: "Running",
  scoring: "Scoring",
  executing: "Executing",
  complete: "",
  failed: "Failed",
};

interface RaceGridProps {
  tasks: TaskInfo[];
  models: ModelInfo[];
  cells: Record<string, RaceResult>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}

export function RaceGrid({ tasks, models, cells, selected, onSelect }: RaceGridProps): JSX.Element {
  const rowWinner = useMemo(() => {
    const map = new Map<string, string>(); // taskId -> winning modelId
    for (const task of tasks) {
      const row = models
        .map((m) => cells[cellKey(task.id, m.id)])
        .filter((c): c is RaceResult => Boolean(c));
      const w = pickWinner(row);
      if (w) map.set(task.id, w.modelId);
    }
    return map;
  }, [tasks, models, cells]);

  return (
    <div className="grid-wrap">
      <table className="race-grid">
        <thead>
          <tr>
            <th className="corner" scope="col">
              Task
            </th>
            {models.map((m) => (
              <th key={m.id} scope="col" className="model-head" title={m.id}>
                <span className="model-label">{m.label}</span>
                {m.vendor ? <span className="model-vendor">{m.vendor}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <th scope="row" className="task-head">
                <span className="task-head-name">{task.name}</span>
                <TaskTypeBadge type={task.type} />
              </th>
              {models.map((m) => {
                const key = cellKey(task.id, m.id);
                const cell = cells[key];
                const isWinner = rowWinner.get(task.id) === m.id;
                return (
                  <td key={m.id} className="grid-cell-td">
                    <Cell
                      cell={cell}
                      winner={isWinner}
                      selected={selected === key}
                      onClick={() => onSelect(selected === key ? null : key)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  cell,
  winner,
  selected,
  onClick,
}: {
  cell: RaceResult | undefined;
  winner: boolean;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  const state: CellState = cell?.state ?? "queued";
  const classes = [
    "grid-cell",
    `cell-${state}`,
    winner && state === "complete" ? "cell-winner" : "",
    selected ? "cell-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLabel = cell
    ? `${state}${state === "complete" ? `, score ${pct(cell.score)}` : ""}${winner ? ", row winner" : ""}`
    : "queued";

  return (
    <button className={classes} onClick={onClick} aria-label={ariaLabel} aria-pressed={selected}>
      {state === "complete" && cell ? (
        <>
          <span className="cell-score">{pct(cell.score)}</span>
          {cell.sandbox ? (
            <span
              className={`cell-sandbox ${cell.sandbox.passed === cell.sandbox.total ? "ok" : "partial"}`}
            >
              {cell.sandbox.passed}/{cell.sandbox.total}
            </span>
          ) : null}
          {winner ? <span className="cell-crown" aria-hidden="true" /> : null}
        </>
      ) : state === "failed" ? (
        <span className="cell-state cell-state-failed">Failed</span>
      ) : (
        <span className={`cell-state`}>
          <span className={`cell-pulse ${state === "queued" ? "idle" : ""}`} aria-hidden="true" />
          {STATE_LABEL[state]}
        </span>
      )}
    </button>
  );
}
