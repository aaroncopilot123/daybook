"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Flag, Hash, Inbox, Plus, Repeat, X } from "lucide-react";
import {
  dateLabel,
  dayInSentence,
  dayLabel,
  findDateToken,
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
  type TaskDraft,
} from "../lib/tasks";
import { AppSelect } from "./app-select";
import styles from "./task-composer.module.css";

export function TaskComposer({
  initial,
  projects,
  editing = false,
  completed = false,
  onSave,
  onCancel,
}: {
  initial: TaskDraft;
  projects: Project[];
  editing?: boolean;
  // A completed occurrence; its open copy owns the series, so it can't change the repeat.
  completed?: boolean;
  onSave: (draft: TaskDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  // The lowercased date word the user rejected; starts with any word already in an edited title.
  const [dismissed, setDismissed] = useState(
    () => findDateToken(initial.title)?.text.toLowerCase() ?? null,
  );
  // A start date picked while a typed repeat phrase is active; the phrase keeps its rule.
  const [repeatStart, setRepeatStart] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const repeatRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(""), 1000);
    return () => window.clearTimeout(timer);
  }, [announcement]);
  const update = (value: Partial<TaskDraft>) =>
    setDraft((current) => ({ ...current, ...value }));
  const match = findDateToken(draft.title);
  const token = match && match.text.toLowerCase() !== dismissed ? match : null;
  const repeatToken = token?.recurrence ? token : null;
  // A phrase typed in the title wins over the controls until it stops matching or is dismissed.
  const recurrence = token?.recurrence ?? draft.recurrence;
  const rawDueDate =
    (repeatToken && repeatStart) ||
    token?.date ||
    draft.dueDate ||
    (recurrence ? localDate() : null);
  const dueDate = rawDueDate && snapToRule(recurrence, rawDueDate);
  const longRepeat = recurrence
    ? recurrenceLabel(recurrence, dueDate, "sentence")
    : "";
  const dismiss = () => {
    if (!token) return;
    setDismissed(token.text.toLowerCase());
    if (token.recurrence) setAnnouncement("Repeat removed");
  };
  const pickDate = (value: string | null) => {
    if (value === null) {
      if (recurrence) setAnnouncement("Date and repeat removed");
      update({ dueDate: null, recurrence: null });
      if (token) setDismissed(token.text.toLowerCase());
      return;
    }
    // Picking a start date keeps a repeat rule; it only replaces a plain day word.
    if (repeatToken) setRepeatStart(value);
    else {
      update({ dueDate: value });
      dismiss();
    }
    const start = snapToRule(recurrence, value);
    if (start !== value) setAnnouncement(`Starts ${dayLabel(start)}`);
  };
  const pickRepeat = (rule: Recurrence | null) => {
    if (repeatToken) {
      update({ recurrence: rule, dueDate });
      dismiss();
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
          recurrence,
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
              const next = findDateToken(title);
              if (next?.text.toLowerCase() !== dismissed) setDismissed(null);
              if (next?.text !== match?.text) setRepeatStart(null);
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
          {announcement ||
            (repeatToken && dueDate
              ? `Repeats ${longRepeat}, starting ${dayInSentence(dueDate)}`
              : token
                ? `Due ${dayLabel(token.date)}`
                : "")}
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
          {!completed && (
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
          {repeatToken && dueDate ? (
            <button
              type="button"
              className={`${styles["date-chip"]} ${styles.selected}`}
              onClick={dismiss}
              aria-label={`Remove repeat: ${longRepeat}, starting ${dayInSentence(dueDate)}`}
            >
              <Repeat size={14} />
              {recurrenceLabel(repeatToken.recurrence!, dueDate)} · {dateLabel(dueDate)}
              <X size={13} />
            </button>
          ) : token ? (
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
            dueDate && (
              <button
                type="button"
                className={styles["date-chip"]}
                onClick={() => pickDate(null)}
                aria-label={recurrence ? "Remove date and repeat" : undefined}
              >
                <X size={13} />
                No date
              </button>
            )
          )}
        </div>
        {customOpen && recurrence && dueDate && !completed && (
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
