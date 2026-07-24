// Screen 4: the payoff. Per-task routing recommendations + an honest single-model-vs-routing
// comparison computed from the RunRecord (deltas may be negative and are shown as such), plus
// export / Braintrust / start-another actions.

import { buildExport, compareStacks } from "../lib/routing";
import { latency, money, pct, signedPct, signedPts } from "../lib/format";
import type { ModelInfo, RaceResult, RoutingCard, RunSummary, TaskInfo } from "../types";
import { TaskTypeBadge } from "./Decomposition";

interface RoutingViewProps {
  card: RoutingCard;
  summary: RunSummary;
  results: RaceResult[];
  models: ModelInfo[];
  tasks: TaskInfo[];
  onStartAnother: () => void;
}

const modelLabel = (models: ModelInfo[], id: string | null): string =>
  id ? (models.find((m) => m.id === id)?.label ?? id) : "—";

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// good=true means "this direction is favorable" -> green; else amber.
const deltaClass = (value: number, goodWhenNegative: boolean): string => {
  if (Math.abs(value) < 0.05) return "delta-flat";
  const favorable = goodWhenNegative ? value < 0 : value > 0;
  return favorable ? "delta-good" : "delta-bad";
};

export function RoutingView({
  card,
  summary,
  results,
  models,
  tasks,
  onStartAnother,
}: RoutingViewProps): JSX.Element {
  const cmp = compareStacks(card, results, models, tasks);
  const firstBraintrust = card.entries.find((e) => e.braintrustUrl)?.braintrustUrl ?? null;

  return (
    <section className="routing">
      <div className="routing-head">
        <h2>
          Your optimized <span className="accent">{summary.industry}</span> model stack
        </h2>
        <p className="dim">
          One specialist per task, each backed by real eval evidence
          {card.entries.some((e) => e.sandboxVerified) ? " and execution" : ""}.
        </p>
      </div>

      <div className="routing-entries">
        {card.entries.map((e) => (
          <article className="route-card" key={e.taskId}>
            <div className="route-card-top">
              <div className="route-task">
                <span className="route-task-name">{e.taskName}</span>
                <TaskTypeBadge type={e.taskType} />
              </div>
              <div className="route-score">
                <span className="route-score-num">{pct(e.score, 0)}</span>
              </div>
            </div>

            <div className="route-model">
              <span className="route-model-label">Recommended</span>
              <span className="route-model-name">{modelLabel(models, e.bestModelId)}</span>
              {e.sandboxVerified ? (
                <span className="verify-badge" title="Verified by real execution in Daytona">
                  ✓ Daytona-verified
                </span>
              ) : null}
            </div>

            <div className="route-runner dim">
              vs {modelLabel(models, e.runnerUpModelId)}
              {e.scoreDelta > 0 ? (
                <span className="route-delta"> · {signedPts(e.scoreDelta * 100, 1)}</span>
              ) : null}
            </div>

            <p className="route-rationale">{e.rationale}</p>

            <div className="route-foot">
              <span className="route-metric">
                <span className="dim">latency</span> {latency(e.p50LatencyMs)}
              </span>
              <span className="route-metric">
                <span className="dim">cost/1k</span> {money(e.costPer1k)}
              </span>
              {e.braintrustUrl ? (
                <a className="route-link" href={e.braintrustUrl} target="_blank" rel="noreferrer">
                  Braintrust ↗
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div className="compare">
        <h3>The case for routing</h3>
        <div className="compare-grid">
          <div className="compare-col">
            <div className="compare-col-head">One model for everything</div>
            <div className="compare-col-sub dim">
              {cmp.baseline ? modelLabel(models, cmp.baseline.modelId) : "—"}
            </div>
            <dl className="compare-stats">
              <div>
                <dt>Avg score</dt>
                <dd>{cmp.baseline ? pct(cmp.baseline.avgScore, 1) : "—"}</dd>
              </div>
              <div>
                <dt>Agg cost / 1k</dt>
                <dd>{cmp.baseline ? money(cmp.baseline.aggCostPer1k) : "—"}</dd>
              </div>
              <div>
                <dt>Avg latency</dt>
                <dd>{cmp.baseline ? latency(cmp.baseline.avgLatencyMs) : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="compare-col compare-col-primary">
            <div className="compare-col-head">Darwin routing</div>
            <div className="compare-col-sub dim">{card.entries.length} specialists</div>
            <dl className="compare-stats">
              <div>
                <dt>Avg score</dt>
                <dd>{pct(cmp.routing.avgScore, 1)}</dd>
              </div>
              <div>
                <dt>Agg cost / 1k</dt>
                <dd>{money(cmp.routing.aggCostPer1k)}</dd>
              </div>
              <div>
                <dt>Avg latency</dt>
                <dd>{latency(cmp.routing.avgLatencyMs)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {cmp.baseline ? (
          <div className="compare-deltas" role="list">
            <div className="delta-chip" role="listitem">
              <span className="dim">Quality</span>
              <span className={deltaClass(cmp.qualityDeltaPct, false)}>
                {signedPts(cmp.qualityDeltaPct, 1)}
              </span>
            </div>
            <div className="delta-chip" role="listitem">
              <span className="dim">Cost</span>
              <span className={deltaClass(cmp.costDeltaPct, true)}>
                {signedPct(cmp.costDeltaPct, 1)}
              </span>
            </div>
            <div className="delta-chip" role="listitem">
              <span className="dim">Latency</span>
              <span className={deltaClass(cmp.latencyDeltaPct, true)}>
                {signedPct(cmp.latencyDeltaPct, 1)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="routing-actions">
        <button
          className="btn btn-primary"
          onClick={() => downloadJson(`${summary.runId}-routing.json`, buildExport(card, summary))}
        >
          Export routing config
        </button>
        <a
          className={`btn btn-ghost ${firstBraintrust ? "" : "btn-disabled"}`}
          href={firstBraintrust ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!firstBraintrust}
        >
          View Braintrust experiments
        </a>
        <button className="btn btn-ghost" onClick={onStartAnother}>
          Start another run
        </button>
      </div>
    </section>
  );
}
