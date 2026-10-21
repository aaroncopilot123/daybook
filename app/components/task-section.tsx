"use client";

import { useId, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Task } from "../lib/tasks";
import styles from "./task-section.module.css";

export function TaskSection({
  title,
  tasks,
  expanded,
  onToggle,
  date,
  overdue = false,
  emptyText = "No tasks due today. A little room to breathe.",
  summaryNoun = overdue ? "overdue" : "due today",
  children,
}: {
  title: string;
  tasks: Task[];
  expanded: boolean;
  onToggle: () => void;
  date?: string;
  overdue?: boolean;
  // What an empty section says, and what its collapsed summary calls its tasks ("3 overdue").
  emptyText?: string;
  summaryNoun?: string;
  children: ReactNode;
}) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const count = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  return (
    <section
      className={`${styles["task-section"]} ${styles["collapsible-section"]} ${overdue ? styles["overdue-section"] : ""}`}
    >
      <h2 className={`${styles["section-heading"]} ${overdue ? styles["overdue-heading"] : ""}`}>
        <button
          ref={toggle}
          type="button"
          className={styles["section-toggle"]}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={id}
        >
          <ChevronDown size={15} aria-hidden="true" />
          {title}
          <span className={styles["section-count"]}>{tasks.length}</span>
        </button>
        {date && <span className={styles["section-date"]}>{date}</span>}
      </h2>
      <div id={id} className={styles["section-content"]}>
        {expanded ? (
          tasks.length ? children : <p className={styles["section-empty"]}>{emptyText}</p>
        ) : (
          <button
            type="button"
            className={styles["section-summary"]}
            onClick={() => {
              onToggle();
              toggle.current?.focus();
            }}
            aria-label={`Expand ${title}: ${count}`}
            aria-expanded={false}
            aria-controls={id}
          >
            <span className={styles["summary-copy"]}>
              <strong>{count} {summaryNoun}</strong>
              <span className={styles["summary-previews"]}>
                {tasks.length ? tasks.slice(0, 3).map((task) => (
                  <span key={task.id}>{task.title}</span>
                )) : <span>{emptyText}</span>}
              </span>
              {tasks.length > 3 && <span className={styles["summary-more"]}>+{tasks.length - 3} more</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
