// Screen 2: decomposition. Tasks appear as they are created (driven by real task_created events).

import type { TaskInfo, TaskType } from "../types";

const TYPE_CLASS: Record<TaskType, string> = {
  TEXT: "type-text",
  STRUCTURED: "type-structured",
  CODE: "type-code",
};

export function TaskTypeBadge({ type }: { type: TaskType }): JSX.Element {
  return <span className={`type-badge ${TYPE_CLASS[type]}`}>{type}</span>;
}

export function Decomposition({
  industry,
  tasks,
}: {
  industry: string;
  tasks: TaskInfo[];
}): JSX.Element {
  return (
    <section className="decomp">
      <div className="decomp-head">
        <h2>Understanding your AI workload</h2>
        <p className="dim">
          Darwin is converting <strong>{industry}</strong> into measurable model tasks.
        </p>
      </div>
      <ul className="task-list" aria-live="polite">
        {tasks.map((t) => (
          <li key={t.id} className="task-item task-enter">
            <div className="task-item-main">
              <span className="task-name">{t.name}</span>
              <span className="task-desc">{t.description}</span>
            </div>
            <div className="task-item-meta">
              <TaskTypeBadge type={t.type} />
              <span className="case-count">{t.caseCount} cases</span>
            </div>
          </li>
        ))}
        {tasks.length === 0 ? (
          <li className="task-item task-skeleton" aria-hidden="true">
            <div className="task-item-main">
              <span className="skeleton-line" />
              <span className="skeleton-line short" />
            </div>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
