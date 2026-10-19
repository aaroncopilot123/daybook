"use client";

import { useId } from "react";
import {
  CalendarDays,
  Check,
  Flag,
  Hash,
  MoreHorizontal,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  dateLabel,
  localDate,
  recurrenceLabel,
  type Project,
  type Task,
} from "../lib/tasks";
import styles from "./task-row.module.css";

export function TaskRow({
  task,
  project,
  rolledOver = false,
  onRolledOver,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  project?: Project;
  // The next occurrence that just replaced a completed recurring task.
  rolledOver?: boolean;
  onRolledOver?: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const metadataId = useId();
  const hasMetadata = !!(task.dueDate || project || task.priority || task.completedAt);
  return (
    <li
      data-task-id={task.id}
      className={`${styles["task-row"]} ${task.completedAt ? styles["is-completed"] : ""} ${rolledOver ? styles["rolled-over"] : ""}`}
      onAnimationEnd={rolledOver ? onRolledOver : undefined}
    >
      <button
        className={styles["completion-target"]}
        aria-label={`${task.completedAt ? "Restore" : "Complete"} ${task.title}`}
        aria-describedby={hasMetadata ? metadataId : undefined}
        aria-pressed={!!task.completedAt}
        onClick={onToggle}
      >
        <span className={styles["completion-circle"]}>
          <Check size={12} strokeWidth={2.5} />
        </span>
      </button>
      <button
        className={styles["task-content"]}
        onClick={onEdit}
        aria-label={`Edit ${task.title}`}
        aria-describedby={hasMetadata ? metadataId : undefined}
      >
        <span className={styles["task-title"]}>{task.title}</span>
        {task.description && (
          <span className={styles["task-description"]}>{task.description}</span>
        )}
        {hasMetadata && (
          <span id={metadataId} className={styles["task-metadata"]}>
            {task.completedAt && (
              <span className={styles["completion-date"]}>
                Completed{" "}
                {new Date(task.completedAt).toLocaleString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
            {task.dueDate && (
              <span
                className={
                  !task.completedAt && task.dueDate < localDate()
                    ? styles["overdue-date"]
                    : task.dueDate === localDate()
                      ? styles["today-date"]
                      : ""
                }
              >
                <CalendarDays size={12} />
                {dateLabel(task.dueDate)}
                {!task.completedAt && task.dueDate < localDate()
                  ? " · Overdue"
                  : ""}
              </span>
            )}
            {task.recurrence && (
              <span className={styles["repeat-label"]}>
                <Repeat size={12} aria-hidden="true" />
                <span aria-hidden="true">
                  {recurrenceLabel(task.recurrence, task.dueDate)}
                </span>
                <span className="sr-only">
                  Repeats{" "}
                  {recurrenceLabel(task.recurrence, task.dueDate, "sentence")}
                </span>
              </span>
            )}
            {project && (
              <span>
                <Hash size={12} />
                {project.name}
              </span>
            )}
            {task.priority && (
              <span className={`${styles["priority-badge"]} ${styles[`priority-${task.priority}`]}`}>
                <Flag size={11} />
                {
                  {
                    1: "P1 · High",
                    2: "P2 · Medium",
                    3: "P3 · Low",
                    4: "P4 · Lowest",
                  }[task.priority]
                }
              </span>
            )}
          </span>
        )}
      </button>
      {task.completedAt && (
        <button
          className={styles["restore-button"]}
          aria-label={`Restore ${task.title} to incomplete`}
          onClick={onToggle}
        >
          <RotateCcw size={14} />
          <span>Restore</span>
        </button>
      )}
      <details
        className={styles["row-menu"]}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          className="icon-button"
          aria-label={`Actions for ${task.title}`}
        >
          <MoreHorizontal size={18} />
        </summary>
        <div className={styles["menu-popover"]}>
          <button
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onEdit();
            }}
          >
            <Pencil size={14} />
            Edit task
          </button>
          <button
            className={styles["danger-text"]}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onDelete();
            }}
          >
            <Trash2 size={14} />
            Delete task
          </button>
        </div>
      </details>
    </li>
  );
}
