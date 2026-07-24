// Previous-run library, built from persisted/recorded RunDocs. Cached runs open INSTANTLY (the
// store hydrates final state; no fake loading). Every card carries an honest source badge.

import { pct, formatDate } from "../lib/format";
import { RUN_LIBRARY } from "../fixtures";
import type { RunDoc } from "../types";
import { SourceBadge } from "./SourceBadge";

export function RunLibrary({
  onOpen,
  onClose,
}: {
  onOpen: (doc: RunDoc) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <section className="library">
      <div className="library-head">
        <div>
          <h2>Previous runs</h2>
          <p className="dim">Recorded and previously computed routing runs. Open any instantly.</p>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="library-grid">
        {RUN_LIBRARY.map((doc) => (
          <article className="lib-card" key={doc.summary.runId}>
            <div className="lib-card-head">
              <h3>{doc.summary.industry}</h3>
              <SourceBadge source={doc.summary.source} date={formatDate(doc.summary.createdAt)} />
            </div>
            <dl className="lib-stats">
              <div>
                <dt>Tasks</dt>
                <dd>{doc.summary.taskCount}</dd>
              </div>
              <div>
                <dt>Models</dt>
                <dd>{doc.summary.modelCount}</dd>
              </div>
              <div>
                <dt>Overall</dt>
                <dd>{doc.summary.overallScore !== undefined ? pct(doc.summary.overallScore, 0) : "—"}</dd>
              </div>
            </dl>
            <button className="btn btn-primary btn-block" onClick={() => onOpen(doc)}>
              Open run
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
