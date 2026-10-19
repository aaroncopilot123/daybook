"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Flag, Hash, Inbox, Plus, X } from "lucide-react";
import {
  dayLabel,
  findDateToken,
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
  // The lowercased date word the user rejected; starts with any word already in an edited title.
  const [dismissed, setDismissed] = useState(
    () => findDateToken(initial.title)?.text.toLowerCase() ?? null,
  );
  const titleRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const update = (value: Partial<TaskDraft>) =>
    setDraft((current) => ({ ...current, ...value }));
  const match = findDateToken(draft.title);
  const token = match && match.text.toLowerCase() !== dismissed ? match : null;
  // A date typed in the title wins over the chips until it stops matching or is dismissed.
  const dueDate = token ? token.date : draft.dueDate;
  const dismiss = () => {
    if (token) setDismissed(token.text.toLowerCase());
  };
  const pickDate = (value: string | null) => {
    update({ dueDate: value });
    dismiss();
  };
  const syncMirror = () => {
    if (mirrorRef.current && titleRef.current)
      mirrorRef.current.scrollLeft = titleRef.current.scrollLeft;
  };

  return (
    <form
      className={styles["task-composer"]}
      onSubmit={(event) => {
        event.preventDefault();
        const title = token
          ? `${draft.title.slice(0, token.start)} ${draft.title.slice(token.end)}`
              .replace(/\s+/g, " ")
              .trim()
          : draft.title.trim();
        if (!title) {
          setError("Give your task a name.");
          titleRef.current?.focus();
          return;
        }
        if (dueDate && !isDate(dueDate)) {
          setError("Choose a valid date.");
          return;
        }
        onSave({
          ...draft,
          title,
          dueDate,
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
        <div className={styles["title-field"]}>
          {token && (
            <div
              ref={(node) => {
                mirrorRef.current = node;
                syncMirror();
              }}
              className={styles["title-mirror"]}
              aria-hidden="true"
            >
              {draft.title.slice(0, token.start)}
              <mark className={styles["date-token"]}>{token.text}</mark>
              {draft.title.slice(token.end)}
            </div>
          )}
          <input
            data-initial-focus
            ref={titleRef}
            id={`${id}-title`}
            className={styles["task-title-input"]}
            placeholder="What would you like to get done?"
            maxLength={500}
            value={draft.title}
            onChange={(event) => {
              const title = event.target.value;
              if (findDateToken(title)?.text.toLowerCase() !== dismissed)
                setDismissed(null);
              update({ title });
              setError("");
            }}
            onKeyDown={(event) => {
              const input = event.currentTarget;
              if (
                token &&
                event.key === "Backspace" &&
                input.selectionStart === token.end &&
                input.selectionEnd === token.end
              ) {
                event.preventDefault();
                dismiss();
              }
            }}
            onScroll={syncMirror}
            onSelect={syncMirror}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        <span role="status" className="sr-only">
          {token ? `Due ${dayLabel(token.date)}` : ""}
        </span>
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
            className={`${styles["date-chip"]} ${dueDate === localDate() ? styles.selected : ""}`}
            onClick={() => pickDate(localDate())}
          >
            <CalendarDays size={14} />
            Today
          </button>
          <button
            type="button"
            className={`${styles["date-chip"]} ${dueDate === localDate(1) ? styles.selected : ""}`}
            onClick={() => pickDate(localDate(1))}
          >
            Tomorrow
          </button>
          <label
            className={`${styles["date-chip"]} ${styles["date-picker"]} ${dueDate && dueDate !== localDate() && dueDate !== localDate(1) ? styles.selected : ""}`}
          >
            <span>Choose date</span>
            <input
              aria-label="Choose due date"
              type="date"
              value={dueDate ?? ""}
              onChange={(event) => pickDate(event.target.value || null)}
            />
          </label>
          {token ? (
            <button
              type="button"
              className={`${styles["date-chip"]} ${styles.selected}`}
              onClick={dismiss}
              aria-label={`Remove due date ${dayLabel(token.date)}`}
            >
              <CalendarDays size={14} />
              {dayLabel(token.date)}
              <X size={13} />
            </button>
          ) : (
            draft.dueDate && (
              <button
                type="button"
                className={styles["date-chip"]}
                onClick={() => pickDate(null)}
              >
                <X size={13} />
                No date
              </button>
            )
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
