"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Check, Plus, X } from "lucide-react";
import { MAX_SUBTASKS, newId, type SubtaskDraft } from "../lib/tasks";
import styles from "./subtask-editor.module.css";

// A line in the composer's subtask list; `key` is stable while editing, `id` marks a saved subtask.
export type SubtaskLine = SubtaskDraft & { key: string };

const plural = (count: number) => `${count} ${count === 1 ? "subtask" : "subtasks"}`;

// The composer's subtask list. Changes stay in the composer until the task is saved.
export function SubtaskEditor({
  lines,
  onLinesChange,
  pending,
  onPendingChange,
  adding,
  onAddingChange,
  recurring,
  announce,
}: {
  lines: SubtaskLine[];
  onLinesChange: (lines: SubtaskLine[]) => void;
  // Text in the add input, saved with the task even if Enter wasn't pressed.
  pending: string;
  onPendingChange: (text: string) => void;
  adding: boolean;
  onAddingChange: (open: boolean) => void;
  recurring: boolean;
  announce: (message: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const inputFor = (key: string) =>
    root.current?.querySelector<HTMLInputElement>(`input[data-line="${CSS.escape(key)}"]`);
  // Where focus goes once the next render lands: a line's key, the add input or its button.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const element = target === "button" ? addButton.current : inputFor(target);
    if (!element) return;
    element.focus();
    if (element instanceof HTMLInputElement)
      element.setSelectionRange(element.value.length, element.value.length);
    // Keep the field above the on-screen keyboard.
    element.scrollIntoView({ block: "nearest" });
  });

  const full = lines.length >= MAX_SUBTASKS;
  const done = lines.filter((line) => line.done).length;
  const order = [...lines.map((line) => line.key), ...(adding && !full ? ["add"] : [])];

  const addTitles = (texts: string[]) => {
    const titles = texts
      .map((text) => text.trim())
      .filter(Boolean)
      .slice(0, MAX_SUBTASKS - lines.length);
    if (!titles.length) return;
    const next = [...lines, ...titles.map((title) => ({ key: newId(), title, done: false }))];
    onLinesChange(next);
    onPendingChange("");
    announce(
      titles.length === 1
        ? `Subtask added: “${titles[0]}”. ${plural(next.length)}.`
        : `${plural(titles.length)} added. ${plural(next.length)}.`,
    );
    focusNext.current = next.length >= MAX_SUBTASKS ? next.at(-1)!.key : "add";
  };

  const remove = (key: string) => {
    const index = lines.findIndex((line) => line.key === key);
    const next = lines.filter((line) => line.key !== key);
    onLinesChange(next);
    announce(`Removed “${lines[index].title || `subtask ${index + 1}`}”.`);
    focusNext.current =
      next[index]?.key ?? next[index - 1]?.key ?? (adding ? "add" : next.length ? null : "button");
  };

  // For moves between fields that already exist, which don't re-render.
  const focusNow = (key: string | undefined) => {
    const element = key && inputFor(key);
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || event.nativeEvent.isComposing) return;
    const key = target.dataset.line;
    if (event.key === "Enter") {
      // Never submit the task from a subtask field, except on purpose with ⌘/Ctrl+Enter.
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) target.form?.requestSubmit();
      else if (key === "add") addTitles([pending]);
      else if (key) focusNow(order[order.indexOf(key) + 1]);
      return;
    }
    if (!key) return;
    if (event.key === "Backspace" && target.value === "") {
      event.preventDefault();
      if (key === "add") focusNow(lines.at(-1)?.key);
      else {
        const index = lines.findIndex((line) => line.key === key);
        onLinesChange(lines.filter((line) => line.key !== key));
        focusNext.current =
          lines[index - 1]?.key ?? lines[index + 1]?.key ?? (adding ? "add" : "button");
      }
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const next = order[order.indexOf(key) + (event.key === "ArrowUp" ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      focusNow(next);
    } else if (event.key === "Escape" && key === "add") {
      // Clear, then close the add row; either way the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      if (pending) onPendingChange("");
      else {
        onAddingChange(false);
        focusNext.current = "button";
      }
    }
  };

  return (
    <div
      ref={root}
      className={styles.subtasks}
      role="group"
      aria-labelledby={`${id}-heading`}
      onKeyDown={onKeyDown}
    >
      <h3
        id={`${id}-heading`}
        className={`${styles["subtasks-heading"]} ${lines.length ? "" : "sr-only"}`}
      >
        Subtasks
        {lines.length > 0 && (
          <>
            <span className={styles["subtasks-count"]} aria-hidden="true">
              {done}/{lines.length}
            </span>
            <span className="sr-only">
              , {done} of {lines.length} done
            </span>
          </>
        )}
      </h3>
      {recurring && (
        <p className={styles["subtasks-hint"]}>Each repeat starts with these subtasks unchecked.</p>
      )}
      {lines.length > 0 && (
        <ul className={styles["subtask-items"]} aria-labelledby={`${id}-heading`}>
          {lines.map((line, index) => (
            <li
              key={line.key}
              className={`${styles["subtask-item"]} ${line.id ? "" : styles.added}`}
            >
              <label className={styles["subtask-check"]}>
                <input
                  type="checkbox"
                  checked={line.done}
                  aria-label={`Done: ${line.title || `subtask ${index + 1}`}`}
                  onChange={(event) =>
                    onLinesChange(
                      lines.map((item) =>
                        item.key === line.key ? { ...item, done: event.target.checked } : item,
                      ),
                    )
                  }
                />
                <Check size={11} strokeWidth={2.5} aria-hidden="true" />
              </label>
              <input
                data-line={line.key}
                className={`${styles["subtask-title-input"]} ${line.done ? styles.done : ""}`}
                value={line.title}
                maxLength={500}
                aria-label={`Subtask ${index + 1} of ${lines.length}`}
                onChange={(event) =>
                  onLinesChange(
                    lines.map((item) =>
                      item.key === line.key ? { ...item, title: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className={`icon-button ${styles["subtask-remove"]}`}
                aria-label={`Remove subtask “${line.title || `subtask ${index + 1}`}”`}
                onClick={() => remove(line.key)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className={styles["subtasks-hint"]}>That’s the 50-subtask limit.</p>
      ) : adding ? (
        <div className={`${styles["subtask-item"]} ${styles["subtask-add-row"]}`}>
          <span className={styles["subtask-plus"]} aria-hidden="true">
            <Plus size={14} />
          </span>
          <input
            data-line="add"
            className={styles["subtask-title-input"]}
            value={pending}
            maxLength={500}
            placeholder="Add a subtask…"
            aria-label="New subtask"
            aria-describedby={`${id}-add-hint`}
            enterKeyHint="enter"
            onChange={(event) => onPendingChange(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!/\r?\n/.test(text)) return;
              // A pasted list becomes one subtask per line.
              event.preventDefault();
              addTitles([pending, ...text.split(/\r?\n/)]);
            }}
          />
          <span id={`${id}-add-hint`} className="sr-only">
            Press Enter to add it and start another. Paste a list to add several.
          </span>
        </div>
      ) : (
        <button
          ref={addButton}
          type="button"
          className={styles["subtask-add"]}
          onClick={() => {
            onAddingChange(true);
            focusNext.current = "add";
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add subtask
        </button>
      )}
    </div>
  );
}
