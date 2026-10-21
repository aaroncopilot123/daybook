"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Check, Plus, TextAlignStart, X } from "lucide-react";
import { MAX_SUBTASKS, newId, type SubtaskDraft } from "../lib/tasks";
import styles from "./subtask-editor.module.css";

// A line in the composer's subtask list; `key` is stable while editing, `id` marks a saved
// subtask, and `noteOpen` shows its description field while it's still empty.
export type SubtaskLine = SubtaskDraft & { key: string; noteOpen?: boolean };

// A field to focus: a line's title or description, the add input ("add") or its button
// ("button"), with the selection to restore.
type Field = { key: string; note?: boolean; selection?: [number, number] };

const plural = (count: number) => `${count} ${count === 1 ? "subtask" : "subtasks"}`;
const noteShown = (line: SubtaskLine) => line.description !== "" || !!line.noteOpen;

// Grows a description with its text where `field-sizing` isn't supported.
function grow(element: HTMLTextAreaElement | null) {
  if (!element || CSS.supports("field-sizing", "content")) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

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
  const fieldFor = (field: Field) =>
    root.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      field.note
        ? `textarea[data-note="${CSS.escape(field.key)}"]`
        : `input[data-line="${CSS.escape(field.key)}"]`,
    );
  // Where focus goes once the next render lands.
  const focusNext = useRef<Field | null>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const element = target.key === "button" ? addButton.current : fieldFor(target);
    if (!element) return;
    element.focus();
    if (!(element instanceof HTMLButtonElement)) {
      const [start, end] = target.selection ?? [element.value.length, element.value.length];
      element.setSelectionRange(start, end);
    }
    // Keep the field above the on-screen keyboard.
    element.scrollIntoView({ block: "nearest" });
  });

  const full = lines.length >= MAX_SUBTASKS;
  const done = lines.filter((line) => line.done).length;
  // Every field in reading order, for the arrow keys and Enter.
  const fields: Field[] = [
    ...lines.flatMap((line) => [
      { key: line.key },
      ...(noteShown(line) ? [{ key: line.key, note: true }] : []),
    ]),
    ...(adding && !full ? [{ key: "add" }] : []),
  ];
  const nameOf = (line: SubtaskLine) =>
    line.title || `subtask ${lines.findIndex((item) => item.key === line.key) + 1}`;
  const updateLine = (key: string, change: Partial<SubtaskLine>) =>
    onLinesChange(lines.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const addTitles = (texts: string[], openNote = false) => {
    const titles = texts
      .map((text) => text.trim())
      .filter(Boolean)
      .slice(0, MAX_SUBTASKS - lines.length);
    if (!titles.length) return;
    const added: SubtaskLine[] = titles.map((title) => ({
      key: newId(),
      title,
      description: "",
      done: false,
      noteOpen: openNote,
    }));
    const next = [...lines, ...added];
    onLinesChange(next);
    onPendingChange("");
    announce(
      titles.length === 1
        ? `Subtask added: “${titles[0]}”. ${plural(next.length)}.`
        : `${plural(titles.length)} added. ${plural(next.length)}.`,
    );
    focusNext.current = openNote
      ? { key: added.at(-1)!.key, note: true }
      : { key: next.length >= MAX_SUBTASKS ? next.at(-1)!.key : "add" };
  };

  const remove = (key: string) => {
    const index = lines.findIndex((line) => line.key === key);
    const next = lines.filter((line) => line.key !== key);
    onLinesChange(next);
    announce(`Removed “${nameOf(lines[index])}”.`);
    const target =
      next[index]?.key ?? next[index - 1]?.key ?? (adding ? "add" : next.length ? null : "button");
    focusNext.current = target ? { key: target } : null;
  };

  // For moves between fields that already exist, which don't re-render.
  const focusNow = (field: Field | undefined) => {
    const element = field && fieldFor(field);
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  };

  const openNote = (line: SubtaskLine) => {
    if (noteShown(line)) focusNow({ key: line.key, note: true });
    else {
      updateLine(line.key, { noteOpen: true });
      focusNext.current = { key: line.key, note: true };
    }
  };

  // A blank description closes; the title takes focus.
  const leaveNote = (line: SubtaskLine) => {
    if (line.description.trim()) focusNow({ key: line.key });
    else {
      updateLine(line.key, { description: "", noteOpen: false });
      focusNext.current = { key: line.key };
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    const isNote = target instanceof HTMLTextAreaElement;
    if (!(target instanceof HTMLInputElement || isNote) || event.nativeEvent.isComposing) return;
    const key = isNote ? target.dataset.note : target.dataset.line;
    const line = lines.find((item) => item.key === key);
    const at = fields.findIndex((field) => field.key === key && !!field.note === isNote);
    if (event.key === "Enter") {
      // Never submit the task from a subtask field, except on purpose with ⌘/Ctrl+Enter.
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        target.form?.requestSubmit();
        return;
      }
      // Shift+Enter starts a new line in a description.
      if (isNote && event.shiftKey) return;
      event.preventDefault();
      // Shift+Enter opens a line's description, or adds the typed line and opens its one.
      if (event.shiftKey) {
        if (key === "add") addTitles([pending], true);
        else if (line) openNote(line);
      } else if (key === "add") addTitles([pending]);
      else if (key) focusNow(fields.slice(at + 1).find((field) => !field.note));
      return;
    }
    if (!key) return;
    if (event.key === "Backspace" && target.value === "") {
      if (isNote && line) {
        event.preventDefault();
        leaveNote(line);
      } else if (key === "add") {
        event.preventDefault();
        focusNow(fields[at - 1]);
      } else if (line && !line.description) {
        // A line with a description is only removed with its ✕.
        event.preventDefault();
        const index = lines.indexOf(line);
        onLinesChange(lines.filter((item) => item !== line));
        focusNext.current = {
          key: lines[index - 1]?.key ?? lines[index + 1]?.key ?? (adding ? "add" : "button"),
        };
      }
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const up = event.key === "ArrowUp";
      // A description keeps the arrows until the caret reaches its start or end.
      if (
        isNote &&
        (target.selectionStart !== target.selectionEnd ||
          target.selectionStart !== (up ? 0 : target.value.length))
      )
        return;
      const next = fields[at + (up ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      focusNow(next);
    } else if (event.key === "Escape" && (isNote || key === "add")) {
      // Either way the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      if (isNote && line) leaveNote(line);
      // Clear, then close the add row.
      else if (pending) onPendingChange("");
      else {
        onAddingChange(false);
        focusNext.current = { key: "button" };
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
      <span id={`${id}-line-hint`} className="sr-only">
        Shift+Enter adds a description.
      </span>
      {lines.length > 0 && (
        <ul className={styles["subtask-items"]} aria-labelledby={`${id}-heading`}>
          {lines.map((line, index) => {
            const name = line.title || `subtask ${index + 1}`;
            const noteId = `${id}-note-${line.key}`;
            return (
              <li
                key={line.key}
                className={`${styles["subtask-item"]} ${line.id ? "" : styles.added}`}
                onBlur={(event) => {
                  // An empty description closes once focus moves elsewhere. Without a
                  // target, focus was lost to a re-render, so leave it.
                  if (
                    event.relatedTarget &&
                    !event.currentTarget.contains(event.relatedTarget) &&
                    line.noteOpen &&
                    !line.description.trim()
                  )
                    updateLine(line.key, { description: "", noteOpen: false });
                }}
              >
                <label className={styles["subtask-check"]}>
                  <input
                    type="checkbox"
                    checked={line.done}
                    aria-label={`Done: ${name}`}
                    onChange={(event) => updateLine(line.key, { done: event.target.checked })}
                  />
                  <Check size={11} strokeWidth={2.5} aria-hidden="true" />
                </label>
                <input
                  data-line={line.key}
                  className={`${styles["subtask-title-input"]} ${line.done ? styles.done : ""}`}
                  value={line.title}
                  maxLength={500}
                  aria-label={`Subtask ${index + 1} of ${lines.length}`}
                  aria-describedby={`${id}-line-hint`}
                  onChange={(event) => updateLine(line.key, { title: event.target.value })}
                />
                <button
                  type="button"
                  className={`icon-button ${styles["subtask-note-toggle"]} ${line.description ? styles["has-note"] : ""}`}
                  aria-label={`Description for “${name}”`}
                  aria-expanded={noteShown(line)}
                  aria-controls={noteShown(line) ? noteId : undefined}
                  onClick={() => openNote(line)}
                >
                  <TextAlignStart size={14} />
                </button>
                <button
                  type="button"
                  className={`icon-button ${styles["subtask-remove"]}`}
                  aria-label={`Remove subtask “${name}”`}
                  onClick={() => remove(line.key)}
                >
                  <X size={14} />
                </button>
                {noteShown(line) && (
                  <textarea
                    ref={grow}
                    id={noteId}
                    data-note={line.key}
                    className={`${styles["subtask-note"]} ${line.done ? styles.done : ""}`}
                    value={line.description}
                    rows={1}
                    placeholder="Add a description…"
                    aria-label={`Description for “${name}”`}
                    enterKeyHint="next"
                    onChange={(event) => {
                      grow(event.target);
                      updateLine(line.key, { description: event.target.value });
                    }}
                  />
                )}
              </li>
            );
          })}
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
            Press Enter to add it and start another, or Shift+Enter to add it with a
            description. Paste a list to add several.
          </span>
        </div>
      ) : (
        <button
          ref={addButton}
          type="button"
          className={styles["subtask-add"]}
          onClick={() => {
            onAddingChange(true);
            focusNext.current = { key: "add" };
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add subtask
        </button>
      )}
    </div>
  );
}
