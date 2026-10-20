"use client";

import { useId, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Hash,
  ListPlus,
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
import { matchRanges } from "../lib/search";
import styles from "./task-row.module.css";

const minute = (timestamp: string) => timestamp.slice(0, 16);

// Text with search matches marked.
function Highlighted({ text, terms }: { text: string; terms?: string[] }) {
  const ranges = terms ? matchRanges(text, terms) : [];
  if (!ranges.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className={styles.match}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(text.slice(at));
  return parts;
}

export function TaskRow({
  task,
  project,
  parent,
  subtask = false,
  progress,
  subtasks,
  terms,
  rolledOver = false,
  onRolledOver,
  onToggle,
  onEdit,
  onDelete,
  onAddSubtask,
}: {
  task: Task;
  project?: Project;
  // A subtask shown on its own, away from its parent: shown as a breadcrumb.
  parent?: Task | null;
  // A subtask nested under its parent: compact, and without the parent's project.
  subtask?: boolean;
  progress?: { done: number; total: number };
  // The nested list of subtasks, with its collapse state.
  subtasks?: { expanded: boolean; onToggle: () => void; children: ReactNode };
  // Search terms to highlight.
  terms?: string[];
  // The next occurrence that just replaced a completed recurring task.
  rolledOver?: boolean;
  onRolledOver?: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSubtask?: () => void;
}) {
  const metadataId = useId();
  const subtasksId = useId();
  // A subtask completed together with its shown parent doesn't repeat the parent's time.
  const showCompletion =
    !!task.completed_at &&
    !(subtask && parent?.completed_at && minute(parent.completed_at) === minute(task.completed_at));
  const shownProject = subtask ? undefined : project;
  const hasMetadata = !!(
    task.due_date ||
    shownProject ||
    task.priority ||
    showCompletion ||
    task.recurrence ||
    (parent && !subtask)
  );
  const subtaskCount = progress?.total ?? 0;
  const plural = (count: number) => `${count} ${count === 1 ? "subtask" : "subtasks"}`;
  return (
    <li
      data-task-id={task.id}
      className={`${styles["task-item"]} ${rolledOver ? styles["rolled-over"] : ""}`}
      onAnimationEnd={rolledOver ? onRolledOver : undefined}
    >
      <div
        className={`${styles["task-row"]} ${task.completed_at ? styles["is-completed"] : ""} ${subtaskCount ? styles["has-subtasks"] : ""}`}
      >
        <button
          className={styles["completion-target"]}
          aria-label={`${task.completed_at ? "Restore" : "Complete"} ${task.title}`}
          aria-describedby={hasMetadata ? metadataId : undefined}
          aria-pressed={!!task.completed_at}
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
          {parent && !subtask && (
            <span className={styles["parent-crumb"]} aria-hidden="true">
              <span>{parent.title}</span>
              <ChevronRight size={12} />
            </span>
          )}
          <span className={styles["task-title"]}>
            <Highlighted text={task.title} terms={terms} />
          </span>
          {task.description && (
            <span className={styles["task-description"]}>
              <Highlighted text={task.description} terms={terms} />
            </span>
          )}
          {hasMetadata && (
            <span id={metadataId} className={styles["task-metadata"]}>
              {parent && !subtask && (
                <span className="sr-only">Subtask of {parent.title}.</span>
              )}
              {showCompletion && task.completed_at && (
                <span className={styles["completion-date"]}>
                  Completed{" "}
                  {new Date(task.completed_at).toLocaleString("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
              {task.due_date && (
                <span
                  className={
                    !task.completed_at && task.due_date < localDate()
                      ? styles["overdue-date"]
                      : task.due_date === localDate()
                        ? styles["today-date"]
                        : ""
                  }
                >
                  <CalendarDays size={12} />
                  {dateLabel(task.due_date)}
                  {!task.completed_at && task.due_date < localDate()
                    ? " · Overdue"
                    : ""}
                </span>
              )}
              {task.recurrence && (
                <span className={styles["repeat-label"]}>
                  <Repeat size={12} aria-hidden="true" />
                  <span aria-hidden="true">
                    {recurrenceLabel(task.recurrence, task.due_date)}
                  </span>
                  <span className="sr-only">
                    Repeats{" "}
                    {recurrenceLabel(task.recurrence, task.due_date, "sentence")}
                  </span>
                </span>
              )}
              {shownProject && (
                <span>
                  <Hash size={12} />
                  {shownProject.name}
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
        {task.completed_at && (
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
              {task.parent_id ? "Edit subtask" : "Edit task"}
            </button>
            {onAddSubtask && (
              <button
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onAddSubtask();
                }}
              >
                <ListPlus size={14} />
                Add subtask
              </button>
            )}
            <button
              className={styles["danger-text"]}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                onDelete();
              }}
            >
              <Trash2 size={14} />
              {task.parent_id ? "Delete subtask" : "Delete task"}
            </button>
          </div>
        </details>
        {progress && subtaskCount > 0 && (
          <div className={styles["subtask-bar"]}>
            {subtasks ? (
              <button
                type="button"
                className={styles["subtask-toggle"]}
                aria-expanded={subtasks.expanded}
                aria-controls={subtasksId}
                onClick={subtasks.onToggle}
              >
                <ChevronDown size={14} aria-hidden="true" />
                {task.completed_at ? (
                  <>
                    {plural(subtaskCount)}
                    <span className="sr-only"> of {task.title}</span>
                  </>
                ) : (
                  <>
                    Subtasks
                    <span className="sr-only"> of {task.title},</span>
                    <span aria-hidden="true">
                      {" "}
                      {progress.done}/{progress.total}
                    </span>
                    <span className="sr-only">
                      {" "}
                      {progress.done} of {progress.total} done
                    </span>
                  </>
                )}
              </button>
            ) : (
              <span className={styles["subtask-static"]}>
                Subtasks{" "}
                <span aria-hidden="true">
                  {progress.done}/{progress.total}
                </span>
                <span className="sr-only">
                  {progress.done} of {progress.total} done
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      {subtasks && (
        <ul
          id={subtasksId}
          className={styles["subtask-list"]}
          aria-label={`Subtasks of ${task.title}`}
          hidden={!subtasks.expanded}
        >
          {subtasks.children}
        </ul>
      )}
    </li>
  );
}
