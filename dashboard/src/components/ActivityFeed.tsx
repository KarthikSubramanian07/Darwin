// Compact, meaningful activity feed. Only surfaces product-relevant events (scores, execution,
// routing), never raw infrastructure noise.

import type { FeedItem } from "../store/reducer";

const KIND_ICON: Record<FeedItem["kind"], string> = {
  info: "·",
  score: "▪",
  sandbox: "▸",
  routing: "◆",
  warn: "!",
};

export function ActivityFeed({ items }: { items: FeedItem[] }): JSX.Element {
  return (
    <section className="feed" aria-label="Activity feed">
      <div className="feed-head">
        <h3>Live activity</h3>
      </div>
      <ol className="feed-list" aria-live="polite">
        {items.length === 0 ? (
          <li className="feed-item dim">Waiting for the run to begin…</li>
        ) : (
          items.map((it) => (
            <li key={it.id} className={`feed-item feed-${it.kind}`}>
              <span className="feed-icon" aria-hidden="true">
                {KIND_ICON[it.kind]}
              </span>
              <span className="feed-text">{it.text}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
