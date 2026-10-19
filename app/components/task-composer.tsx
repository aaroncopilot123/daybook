"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Flag, Hash, Inbox, Plus, X } from "lucide-react";
import {
  isDate,
  localDate,
  type Priority,
  type Project,
  type TaskDraft,
} from "../lib/tasks";
import { AppSelect } from "./app-select";
import styles from "./task-composer.module.css";

export function TaskComposer({
  initial,
  projects,
  editing = false,
  onSave,
  onCancel,
}: {
  initial: TaskDraft;
  projects: Project[];
  editing?: boolean;
  onSave: (draft: TaskDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const update = (value: Partial<TaskDraft>) =>
    setDraft((current) => ({ ...current, ...value }));

  return (
    <form
      className={styles["task-composer"]}
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.title.trim()) {
          setError("Give your task a name.");
          titleRef.current?.focus();
          return;
        }
        if (draft.dueDate && !isDate(draft.dueDate)) {
          setError("Choose a valid date.");
          return;
        }
        onSave({
          ...draft,
          title: draft.title.trim(),
          description: draft.description.trim(),
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className={styles["composer-body"]}>
        <label htmlFor={`${id}-title`} className="sr-only">
          Task name
        </label>
        <input
          data-initial-focus
          ref={titleRef}
          id={`${id}-title`}
          className={styles["task-title-input"]}
          placeholder="What would you like to get done?"
          maxLength={500}
          value={draft.title}
          onChange={(event) => {
            update({ title: event.target.value });
            setError("");
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <label htmlFor={`${id}-description`} className="sr-only">
          Description
        </label>
        <textarea
          id={`${id}-description`}
          className={styles["description-input"]}
          placeholder="Add a description…"
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          rows={2}
        />
        <div className={styles["date-shortcuts"]} aria-label="Due date shortcuts">
          <button
            type="button"
            className={`${styles["date-chip"]} ${draft.dueDate === localDate() ? styles.selected : ""}`}
            onClick={() => update({ dueDate: localDate() })}
          >
            <CalendarDays size={14} />
            Today
          </button>
          <button
            type="button"
            className={`${styles["date-chip"]} ${draft.dueDate === localDate(1) ? styles.selected : ""}`}
            onClick={() => update({ dueDate: localDate(1) })}
          >
            Tomorrow
          </button>
          <label
            className={`${styles["date-chip"]} ${styles["date-picker"]} ${draft.dueDate && draft.dueDate !== localDate() && draft.dueDate !== localDate(1) ? styles.selected : ""}`}
          >
            <span>Choose date</span>
            <input
              aria-label="Choose due date"
              type="date"
              value={draft.dueDate ?? ""}
              onChange={(event) =>
                update({ dueDate: event.target.value || null })
              }
            />
          </label>
          {draft.dueDate && (
            <button
              type="button"
              className={styles["date-chip"]}
              onClick={() => update({ dueDate: null })}
            >
              <X size={13} />
              No date
            </button>
          )}
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className={styles["form-error"]}>
            {error}
          </p>
        )}
      </div>
      <div className={styles["composer-footer"]}>
        <div className={styles["composer-selects"]}>
          <AppSelect
            label="Project"
            className={styles["composer-select"]}
            value={draft.projectId ?? ""}
            onChange={(value) => update({ projectId: value || null })}
            icon={draft.projectId ? <Hash size={15} aria-hidden="true" /> : <Inbox size={15} aria-hidden="true" />}
            options={[
              { value: "", label: "No project" },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
          <AppSelect
            label="Priority"
            className={`${styles["composer-select"]} ${draft.priority ? styles[`priority-${draft.priority}`] : ""}`}
            inheritColor
            value={draft.priority?.toString() ?? ""}
            onChange={(value) => update({ priority: value ? Number(value) as Priority : null })}
            icon={<Flag size={15} aria-hidden="true" />}
            options={[
              { value: "", label: "Priority" },
              ...[1, 2, 3, 4].map((priority) => ({
                value: priority.toString(),
                label: `P${priority}${priority === 1 ? " · High" : priority === 4 ? " · Low" : ""}`,
                className: styles[`priority-${priority}`],
              })),
            ]}
          />
        </div>
        <div className={styles["composer-buttons"]}>
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            {!editing && <Plus size={15} />}
            {editing ? "Save changes" : "Add task"}
          </button>
        </div>
      </div>
    </form>
  );
}
