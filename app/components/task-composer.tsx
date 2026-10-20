"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CalendarDays,
  CircleHelp,
  CornerDownRight,
  Flag,
  Hash,
  Inbox,
  Plus,
  Repeat,
  X,
} from "lucide-react";
import {
  dateLabel,
  dayInSentence,
  dayLabel,
  isDate,
  localDate,
  PRESET_RECURRENCES,
  recurrenceKey,
  recurrenceLabel,
  snapToRule,
  WEEK_ORDER,
  WEEKDAY_LONG,
  type Priority,
  type Project,
  type Recurrence,
  newId,
  type SubtaskDraft,
  type TaskDraft,
} from "../lib/tasks";
import {
  dayFirstLocale,
  parseTitle,
  stripTokens,
  tokenKey,
  tokenOf,
  type TitleToken,
  type TokenKind,
} from "../lib/quick-add";
import { AppSelect } from "./app-select";
import { SubtaskEditor, type SubtaskLine } from "./subtask-editor";
import styles from "./task-composer.module.css";

const PRIORITY_NAMES = { 1: "high", 2: "medium", 3: "low", 4: "lowest" } as const;

// dayLabel, with the year when it isn't this year ("Tue, Oct 26, 2027").
function dueLabel(value: string) {
  return value.slice(0, 4) === localDate().slice(0, 4)
    ? dayLabel(value)
    : `${dayLabel(value)}, ${value.slice(0, 4)}`;
}

export function TaskComposer({
  initial,
  projects,
  editing = false,
  completed = false,
  parentTitle,
  subtasks = [],
  onSave,
  onCancel,
}: {
  initial: TaskDraft;
  projects: Project[];
  editing?: boolean;
  // A completed occurrence; its open copy owns the series, so it can't change the repeat.
  completed?: boolean;
  // Set for a subtask, which takes its parent's project and never repeats.
  parentTitle?: string;
  // A parent's current subtasks, edited here and saved with the task.
  subtasks?: SubtaskDraft[];
  onSave: (draft: TaskDraft, subtasks?: SubtaskDraft[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  // Keys of title tokens the user kept as plain text. An edited title starts with its
  // words already plain, so reopening "Review Monday notes" doesn't change anything.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() =>
    editing ? new Set(parseTitle(initial.title, { projects }).map(tokenKey)) : new Set(),
  );
  // A start date picked while a typed repeat phrase is active; the phrase keeps its rule.
  const [repeatStart, setRepeatStart] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [lines, setLines] = useState<SubtaskLine[]>(() =>
    subtasks.map((subtask) => ({ ...subtask, key: subtask.id ?? newId() })),
  );
  const [pendingSubtask, setPendingSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const repeatRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);
  const announcedKeys = useRef<ReadonlySet<string>>(new Set());
  const id = useId();
  useEffect(() => {
    const input = titleRef.current;
    if (!input) return;
    input.focus();
    // A prefilled title continues where it ends.
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(""), 1000);
    return () => window.clearTimeout(timer);
  }, [announcement]);
  const update = (value: Partial<TaskDraft>) =>
    setDraft((current) => ({ ...current, ...value }));

  const isSubtask = draft.parent_id !== null;
  const canRepeat = !completed && !isSubtask;
  // Subtasks are one level deep, and a completed task's subtasks live in History.
  const showSubtasks = !isSubtask && !completed;
  // Kinds a task can't take from its title. They're still matched, so "every mon" isn't
  // read as a bare "mon", but never applied: a completed occurrence never gains a repeat,
  // and a subtask has its parent's project and never repeats.
  const ignoredKinds: TokenKind[] = [
    ...(canRepeat ? [] : ["repeat" as const]),
    ...(isSubtask ? ["project" as const] : []),
  ];
  const parsed = parseTitle(draft.title, { projects });
  const tokens = parsed.filter(
    (token) => !dismissed.has(tokenKey(token)) && !ignoredKinds.includes(token.kind),
  );
  const dateToken = tokenOf(tokens, "date");
  const repeatToken = tokenOf(tokens, "repeat");
  const projectToken = tokenOf(tokens, "project");
  const priorityToken = tokenOf(tokens, "priority");
  // Words typed in the title win over the controls until they stop matching or are dismissed.
  const recurrence = repeatToken?.recurrence ?? draft.recurrence;
  const rawDueDate =
    (repeatToken && repeatStart) ||
    dateToken?.date ||
    (repeatToken ? localDate() : null) ||
    draft.due_date ||
    (recurrence ? localDate() : null);
  const dueDate = rawDueDate && snapToRule(recurrence, rawDueDate);
  const projectId = projectToken?.projectId ?? draft.project_id;
  const priority = priorityToken?.priority ?? draft.priority;
  const longRepeat = recurrence
    ? recurrenceLabel(recurrence, dueDate, "sentence")
    : "";

  const describe = (token: TitleToken) => {
    if (token.kind === "date") return `Due ${dayInSentence(dueDate ?? token.date)}`;
    if (token.kind === "repeat")
      return `Repeats ${recurrenceLabel(token.recurrence, dueDate, "sentence")}${dueDate ? `, starting ${dayInSentence(dueDate)}` : ""}`;
    if (token.kind === "project") return `Project: ${token.name}`;
    return `Priority ${token.priority}, ${PRIORITY_NAMES[token.priority]}`;
  };
  // Announce newly recognised words once typing pauses, not the whole summary each time.
  const tokenSummary = tokens.map((token) => `${tokenKey(token)}\t${describe(token)}`).join("\n");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const entries = tokenSummary ? tokenSummary.split("\n").map((line) => line.split("\t")) : [];
      const fresh = entries
        .filter(([key]) => !announcedKeys.current.has(key))
        .map(([, message]) => message);
      announcedKeys.current = new Set(entries.map(([key]) => key));
      if (fresh.length) setAnnouncement(fresh.join(". "));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tokenSummary]);

  const dismissTokens = (...list: Array<TitleToken | undefined>) => {
    const keys = list.flatMap((token) => (token ? [tokenKey(token)] : []));
    if (keys.length) setDismissed((current) => new Set([...current, ...keys]));
  };
  // Backspace or a chip's ✕: the words stay in the title as plain text.
  const keepAsText = (token: TitleToken) => {
    dismissTokens(token);
    setAnnouncement(
      `“${token.text}” kept as text.${token.kind === "repeat" && !draft.recurrence ? " Repeat removed." : ""}`,
    );
  };
  const pickDate = (value: string | null) => {
    if (value === null) {
      if (recurrence) setAnnouncement("Date and repeat removed");
      update({ due_date: null, recurrence: null });
      dismissTokens(dateToken, repeatToken);
      return;
    }
    // Picking a start date keeps a repeat rule; it only replaces a typed date.
    if (repeatToken) setRepeatStart(value);
    else update({ due_date: value });
    dismissTokens(dateToken);
    const start = snapToRule(recurrence, value);
    if (start !== value) setAnnouncement(`Starts ${dayLabel(start)}`);
  };
  const pickRepeat = (rule: Recurrence | null) => {
    if (repeatToken) {
      update({ recurrence: rule, due_date: dueDate });
      dismissTokens(repeatToken);
    } else update({ recurrence: rule });
  };
  const presets = PRESET_RECURRENCES.map((rule) => ({
    rule,
    value: recurrenceKey(rule),
    label: recurrenceLabel(rule, dueDate, "long"),
  }));
  // "Every Mon" on a Monday due date is the plain weekly preset.
  const repeatValue =
    recurrence?.unit === "week" &&
    recurrence.interval === 1 &&
    recurrence.weekdays?.length === 1 &&
    dueDate &&
    recurrence.weekdays[0] === new Date(`${dueDate}T12:00:00`).getDay()
      ? recurrenceKey({ interval: 1, unit: "week" })
      : recurrenceKey(recurrence);
  const repeatOptions = [
    { value: "", label: "Doesn't repeat" },
    ...presets,
    ...(recurrence && !presets.some((preset) => preset.value === repeatValue)
      ? [{ value: repeatValue, label: recurrenceLabel(recurrence, dueDate, "long") }]
      : []),
    { value: "custom", label: "Custom…" },
  ];
  const focusRepeat = () => repeatRef.current?.querySelector("button")?.focus();
  const syncMirror = () => {
    if (mirrorRef.current && titleRef.current)
      mirrorRef.current.scrollLeft = titleRef.current.scrollLeft;
  };
  const describedBy = [isSubtask && `${id}-context`, `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  const parentProject = isSubtask && projects.find((project) => project.id === projectId);

  return (
    <form
      className={styles["task-composer"]}
      onSubmit={(event) => {
        event.preventDefault();
        const title = stripTokens(draft.title, tokens);
        if (!title) {
          setError("Give your task a name.");
          titleRef.current?.focus();
          return;
        }
        if (dueDate && !isDate(dueDate)) {
          setError("Choose a valid date.");
          return;
        }
        onSave(
          {
            ...draft,
            title,
            due_date: dueDate,
            recurrence,
            project_id: projectId,
            priority,
            description: draft.description.trim(),
          },
          showSubtasks
            ? [
                ...lines.map((line) => ({ id: line.id, title: line.title.trim(), done: line.done })),
                // Text typed but not yet entered still counts.
                ...(pendingSubtask.trim() ? [{ title: pendingSubtask.trim(), done: false }] : []),
              ]
            : undefined,
        );
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (helpOpen) {
          // Close only the shortcuts panel, not the dialog.
          event.preventDefault();
          setHelpOpen(false);
          helpRef.current?.focus();
          return;
        }
        onCancel();
      }}
    >
      <div className={styles["composer-body"]}>
        {isSubtask && (
          <p id={`${id}-context`} className={styles["subtask-context"]}>
            <CornerDownRight size={13} aria-hidden="true" />
            <span>Subtask of</span>
            <strong>{parentTitle}</strong>
            {parentProject && (
              <>
                <span aria-hidden="true">·</span>
                <span className={styles["subtask-project"]}>
                  <Hash size={12} aria-hidden="true" />
                  {parentProject.name}
                </span>
              </>
            )}
          </p>
        )}
        <label htmlFor={`${id}-title`} className="sr-only">
          Task name
        </label>
        <div className={styles["title-field"]}>
          {tokens.length > 0 && (
            <div
              ref={(node) => {
                mirrorRef.current = node;
                syncMirror();
              }}
              className={styles["title-mirror"]}
              aria-hidden="true"
            >
              {tokens.map((token, index) => (
                <span key={tokenKey(token)}>
                  {draft.title.slice(index ? tokens[index - 1].end : 0, token.start)}
                  <mark className={styles["title-token"]}>{token.text}</mark>
                </span>
              ))}
              {draft.title.slice(tokens.at(-1)!.end)}
            </div>
          )}
          <input
            data-initial-focus
            ref={titleRef}
            id={`${id}-title`}
            className={styles["task-title-input"]}
            placeholder={
              isSubtask
                ? "What’s the next step?"
                : editing
                  ? "What would you like to get done?"
                  : "Try “Call mum tomorrow p1”"
            }
            maxLength={500}
            value={draft.title}
            onChange={(event) => {
              const title = event.target.value;
              const next = parseTitle(title, { projects });
              const nextKeys = new Set(next.map(tokenKey));
              // Forget dismissals for words that are gone, so retyping them parses again.
              setDismissed((current) => {
                const kept = [...current].filter((key) => nextKeys.has(key));
                return kept.length === current.size ? current : new Set(kept);
              });
              if (tokenOf(next, "repeat")?.text !== tokenOf(parsed, "repeat")?.text)
                setRepeatStart(null);
              update({ title });
              setError("");
            }}
            onKeyDown={(event) => {
              const input = event.currentTarget;
              if (event.key !== "Backspace" || input.selectionStart !== input.selectionEnd)
                return;
              const hit = tokens.find((token) => token.end === input.selectionStart);
              if (!hit) return;
              event.preventDefault();
              keepAsText(hit);
            }}
            onScroll={syncMirror}
            onSelect={syncMirror}
            aria-invalid={!!error}
            aria-describedby={describedBy}
          />
        </div>
        <span id={`${id}-hint`} className="sr-only">
          {isSubtask
            ? "You can type a date or p1 to p4 in the name."
            : "You can type a date, #project or p1 to p4 in the name."}
        </span>
        <span role="status" className="sr-only">
          {announcement}
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
          {canRepeat && (
            <div ref={repeatRef} className={styles["repeat-select"]}>
              <AppSelect
                label="Repeat"
                triggerLabel={
                  recurrence ? recurrenceLabel(recurrence, dueDate) : "Repeat"
                }
                triggerAriaLabel={recurrence ? `Repeat: ${longRepeat}` : "Repeat"}
                triggerClassName={`${styles["date-chip"]} ${styles["repeat-trigger"]} ${recurrence ? styles.selected : ""}`}
                icon={<Repeat size={14} aria-hidden="true" />}
                value={repeatValue}
                options={repeatOptions}
                onChange={(value) => {
                  if (value === "custom") {
                    if (!recurrence)
                      pickRepeat({
                        interval: 1,
                        unit: "week",
                        weekdays: [new Date(`${dueDate ?? localDate()}T12:00:00`).getDay()],
                      });
                    else if (repeatToken) pickRepeat(recurrence);
                    setCustomOpen(true);
                    return;
                  }
                  pickRepeat(
                    value
                      ? [...presets, { rule: recurrence, value: repeatValue }].find(
                          (option) => option.value === value,
                        )?.rule ?? null
                      : null,
                  );
                }}
              />
            </div>
          )}
          {repeatToken && dueDate && (
            <button
              type="button"
              className={`${styles["date-chip"]} ${styles.selected}`}
              onClick={() => keepAsText(repeatToken)}
              aria-label={`Remove repeat: ${longRepeat}, starting ${dayInSentence(dueDate)}`}
            >
              <Repeat size={14} />
              {recurrenceLabel(repeatToken.recurrence, dueDate)}
              {!dateToken && ` · ${dateLabel(dueDate)}`}
              <X size={13} />
            </button>
          )}
          {dateToken && dueDate && (
            <button
              type="button"
              className={`${styles["date-chip"]} ${styles.selected}`}
              onClick={() => keepAsText(dateToken)}
              aria-label={`Remove due date ${dueLabel(dueDate)}`}
            >
              <CalendarDays size={14} />
              {dueLabel(dueDate)}
              <X size={13} />
            </button>
          )}
          {!dateToken && !repeatToken && dueDate && (
            <button
              type="button"
              className={styles["date-chip"]}
              onClick={() => pickDate(null)}
              aria-label={recurrence ? "Remove date and repeat" : undefined}
            >
              <X size={13} />
              No date
            </button>
          )}
          <button
            ref={helpRef}
            type="button"
            className={`${styles["date-chip"]} ${styles["help-toggle"]} ${helpOpen ? styles.selected : ""}`}
            aria-label="Typing shortcuts"
            aria-expanded={helpOpen}
            aria-controls={`${id}-help`}
            onClick={() => setHelpOpen((open) => !open)}
          >
            <CircleHelp size={14} aria-hidden="true" />
          </button>
        </div>
        {customOpen && recurrence && dueDate && canRepeat && (
          <RepeatEditor
            rule={recurrence}
            dueDate={dueDate}
            onChange={pickRepeat}
            onClose={() => {
              setCustomOpen(false);
              focusRepeat();
            }}
          />
        )}
        {helpOpen && (
          <div
            id={`${id}-help`}
            className={`${styles["repeat-editor"]} ${styles["typing-help"]}`}
            role="region"
            aria-label="Typing shortcuts"
          >
            <p className={styles["typing-help-heading"]}>Type these in the task name</p>
            <dl>
              <div>
                <dt>
                  <kbd>tomorrow</kbd> <kbd>fri</kbd> <kbd>next week</kbd> <kbd>in 3 days</kbd>{" "}
                  <kbd>Oct 26</kbd> <kbd>{dayFirstLocale() ? "26/10" : "10/26"}</kbd>
                </dt>
                <dd>Due date</dd>
              </div>
              {canRepeat && (
                <div>
                  <dt>
                    <kbd>every day</kbd> <kbd>every mon</kbd> <kbd>weekly</kbd>
                  </dt>
                  <dd>Repeat</dd>
                </div>
              )}
              {projects.length > 0 && !isSubtask && (
                <div>
                  <dt>
                    <kbd>#{projects[0].name}</kbd>
                  </dt>
                  <dd>Project</dd>
                </div>
              )}
              <div>
                <dt>
                  <kbd>p1</kbd>–<kbd>p4</kbd>
                </dt>
                <dd>Priority</dd>
              </div>
            </dl>
            <p className={styles["typing-help-note"]}>
              Highlighted words come out of the name. Press Backspace right after one to keep it as
              text.
            </p>
          </div>
        )}
        {error && (
          <p id={`${id}-error`} role="alert" className={styles["form-error"]}>
            {error}
          </p>
        )}
        {showSubtasks && (
          <SubtaskEditor
            lines={lines}
            onLinesChange={setLines}
            pending={pendingSubtask}
            onPendingChange={setPendingSubtask}
            adding={addingSubtask}
            onAddingChange={setAddingSubtask}
            recurring={!!recurrence}
            announce={setAnnouncement}
          />
        )}
      </div>
      <div className={styles["composer-footer"]}>
        <div className={styles["composer-selects"]}>
          {!isSubtask && (
            <AppSelect
              label="Project"
              className={styles["composer-select"]}
              value={projectId ?? ""}
              onChange={(value) => {
                update({ project_id: value || null });
                dismissTokens(projectToken);
              }}
              icon={projectId ? <Hash size={15} aria-hidden="true" /> : <Inbox size={15} aria-hidden="true" />}
              options={[
                { value: "", label: "No project" },
                ...projects.map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
          )}
          <AppSelect
            label="Priority"
            className={`${styles["composer-select"]} ${priority ? styles[`priority-${priority}`] : ""}`}
            inheritColor
            value={priority?.toString() ?? ""}
            onChange={(value) => {
              update({ priority: value ? Number(value) as Priority : null });
              dismissTokens(priorityToken);
            }}
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
            {editing ? "Save changes" : isSubtask ? "Add subtask" : "Add task"}
          </button>
        </div>
      </div>
    </form>
  );
}

function RepeatEditor({
  rule,
  dueDate,
  onChange,
  onClose,
}: {
  rule: Recurrence;
  dueDate: string;
  onChange: (rule: Recurrence) => void;
  onClose: () => void;
}) {
  const [intervalText, setIntervalText] = useState(String(rule.interval));
  const id = useId();
  const dueWeekday = new Date(`${dueDate}T12:00:00`).getDay();
  const weekdays = rule.weekdays ?? [dueWeekday];
  const plural = rule.interval > 1 ? "s" : "";
  return (
    <div
      className={styles["repeat-editor"]}
      role="group"
      aria-label="Custom repeat"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles["repeat-editor-row"]}>
        <label htmlFor={`${id}-interval`}>Every</label>
        <input
          id={`${id}-interval`}
          autoFocus
          className={styles["repeat-interval"]}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={intervalText}
          onChange={(event) => {
            setIntervalText(event.target.value);
            const interval = Number(event.target.value);
            if (Number.isInteger(interval) && interval >= 1 && interval <= 99)
              onChange({ ...rule, interval });
          }}
          onBlur={() => setIntervalText(String(rule.interval))}
        />
        <AppSelect
          label="Repeat unit"
          className={styles["repeat-unit"]}
          icon={null}
          value={rule.unit}
          options={(["day", "week", "month", "year"] as const).map((unit) => ({
            value: unit,
            label: `${unit}${plural}`,
          }))}
          onChange={(value) => {
            const unit = value as Recurrence["unit"];
            onChange(
              unit === "week"
                ? { interval: rule.interval, unit, weekdays: [dueWeekday] }
                : { interval: rule.interval, unit },
            );
          }}
        />
      </div>
      {rule.unit === "week" && (
        <div className={styles["weekday-toggles"]} role="group" aria-label="Repeat on">
          {WEEK_ORDER.map((day) => {
            const pressed = weekdays.includes(day);
            const locked = pressed && weekdays.length === 1;
            return (
              <button
                key={day}
                type="button"
                className={`${styles["weekday-toggle"]} ${pressed ? styles.selected : ""}`}
                aria-label={WEEKDAY_LONG[day]}
                aria-pressed={pressed}
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (locked) return;
                  onChange({
                    ...rule,
                    weekdays: pressed
                      ? weekdays.filter((item) => item !== day)
                      : [...weekdays, day].sort((a, b) => a - b),
                  });
                }}
              >
                {WEEKDAY_LONG[day][0]}
              </button>
            );
          })}
        </div>
      )}
      <div className={styles["repeat-editor-row"]}>
        <span className={styles["repeat-start"]}>Starts {dayLabel(dueDate)}</span>
        <button type="button" className="button secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
