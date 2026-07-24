// Detail for a selected/hovered race cell: model, task, score, cost, latency, cases, Braintrust
// link, and the Daytona execution result for code tasks.

import { latency, money, pct } from "../lib/format";
import type { ModelInfo, RaceResult, TaskInfo } from "../types";

export function CellDetail({
  result,
  task,
  model,
  onClose,
}: {
  result: RaceResult | null;
  task: TaskInfo | null;
  model: ModelInfo | null;
  onClose: () => void;
}): JSX.Element {
  if (!result || !task || !model) {
    return (
      <aside className="cell-detail cell-detail-empty">
        <p className="dim">Select a cell to inspect the model, score, cost, and evidence.</p>
      </aside>
    );
  }

  return (
    <aside className="cell-detail" aria-label={`${model.label} on ${task.name}`}>
      <div className="cell-detail-head">
        <div>
          <div className="cd-model">{model.label}</div>
          <div className="cd-task dim">{task.name}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close detail">
          ✕
        </button>
      </div>

      {result.state === "complete" ? (
        <>
          <div className="cd-score-block">
            <span className="cd-score">{pct(result.score, 1)}</span>
            <span className="dim">score</span>
          </div>
          <dl className="cd-stats">
            <div>
              <dt>Est. cost / 1k</dt>
              <dd>{money(result.costPer1k)}</dd>
            </div>
            <div>
              <dt>p50 latency</dt>
              <dd>{latency(result.p50LatencyMs)}</dd>
            </div>
            <div>
              <dt>Eval cases</dt>
              <dd>{result.caseCount}</dd>
            </div>
            {result.sandbox ? (
              <div>
                <dt>Daytona execution</dt>
                <dd className={result.sandbox.passed === result.sandbox.total ? "ok" : "partial"}>
                  {result.sandbox.passed}/{result.sandbox.total} tests
                </dd>
              </div>
            ) : null}
          </dl>
          {result.braintrustUrl ? (
            <a className="btn btn-ghost btn-sm cd-link" href={result.braintrustUrl} target="_blank" rel="noreferrer">
              View Braintrust experiment ↗
            </a>
          ) : (
            <p className="cd-nolink dim">No Braintrust experiment link for this cell.</p>
          )}
        </>
      ) : (
        <div className="cd-pending">
          <span className="cd-pending-state">{result.state}</span>
          {result.error ? <p className="cd-error">{result.error}</p> : null}
        </div>
      )}
    </aside>
  );
}
