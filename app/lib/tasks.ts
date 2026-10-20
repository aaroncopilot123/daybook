export type Priority = 1 | 2 | 3 | 4 | null;
// weekdays (0 = Sunday) only apply to weekly rules; without them a weekly rule follows the due date.
export type Recurrence = {
  interval: number;
  unit: "day" | "week" | "month" | "year";
  weekdays?: number[];
};
export type Task = {
  id: string;
  title: string;
  description: string;
  project_id: string | null;
  due_date: string | null;
  priority: Priority;
  recurrence: Recurrence | null;
  // One level deep: a subtask's parent is always a top-level task, and a subtask shares its
  // parent's project and never repeats.
  parent_id: string | null;
  // Manual order: top-level tasks share one order, and each parent orders its own subtasks.
  // Every view shows its tasks in this order.
  sequence: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Project = { id: string; name: string };
export type TaskDraft = Pick<
  Task,
  | "title"
  | "description"
  | "project_id"
  | "due_date"
  | "priority"
  | "recurrence"
  | "parent_id"
>;
export type Snapshot = { version: 5; tasks: Task[]; projects: Project[] };
export type View = "all" | "today" | "upcoming" | "history" | "projects";

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

export function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

// Same day of the month, clamped to shorter months.
export function addMonths(value: string, months: number) {
  const date = parseDate(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(
    Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()),
  );
  return formatDate(date);
}

export function daysBetween(from: string, to: string) {
  const utc = (value: string) =>
    Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8));
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export const weekday = (value: string) => parseDate(value).getDay();

// Upcoming's days: every day from tomorrow through `end`, then any later day in `dates`, so a
// task due beyond the loaded range is never hidden.
export function upcomingDays(today: string, end: string, dates: Iterable<string>) {
  const days: string[] = [];
  for (let day = addDays(today, 1); day <= end; day = addDays(day, 1)) days.push(day);
  const later = [...new Set(dates)].filter((date) => date > end).sort();
  return [...days, ...later];
}

export function dateLabel(value: string) {
  if (value === localDate()) return "Today";
  if (value === localDate(1)) return "Tomorrow";
  return parseDate(value).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

export function dayLabel(value: string) {
  const label = dateLabel(value);
  if (label === "Today" || label === "Tomorrow") return label;
  return parseDate(value).toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// dayLabel for mid-sentence use: "today", "tomorrow", "Mon, Oct 26".
export function dayInSentence(value: string) {
  const label = dayLabel(value);
  return label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label;
}

// The first date strictly after `after` on the schedule that starts at `anchor`.
export function occurrenceAfter(rule: Recurrence, anchor: string, after: string) {
  if (rule.unit === "month" || rule.unit === "year") {
    const step = rule.interval * (rule.unit === "year" ? 12 : 1);
    let date = anchor;
    for (let k = 1; date <= after; k++) date = addMonths(anchor, k * step);
    return date;
  }
  if (rule.unit === "day" || !rule.weekdays) {
    const step = rule.interval * (rule.unit === "week" ? 7 : 1);
    if (anchor > after) return anchor;
    return addDays(anchor, (Math.floor(daysBetween(anchor, after) / step) + 1) * step);
  }
  const weekStart = (value: string) => addDays(value, -weekday(value));
  const anchorWeek = weekStart(anchor);
  let date = addDays(after, 1);
  for (;;) {
    const week = daysBetween(anchorWeek, weekStart(date)) / 7;
    if (
      rule.weekdays.includes(weekday(date)) &&
      ((week % rule.interval) + rule.interval) % rule.interval === 0
    )
      return date;
    date = addDays(date, 1);
  }
}

// Completing early skips ahead; completing late never creates another overdue copy.
export function nextDueDate(rule: Recurrence, dueDate: string, today: string) {
  return occurrenceAfter(rule, dueDate, dueDate > today ? dueDate : today);
}

// Move a date forward to the rule's next weekday, if the rule names weekdays.
export function snapToRule(rule: Recurrence | null, date: string) {
  const days = rule?.unit === "week" ? rule.weekdays : undefined;
  if (!days) return date;
  return addDays(date, Math.min(...days.map((day) => (day - weekday(date) + 7) % 7)));
}

export function normalizeRecurrence(rule: Recurrence): Recurrence {
  const interval = Math.min(99, Math.max(1, Math.round(rule.interval) || 1));
  if (rule.unit !== "week" || !rule.weekdays?.length)
    return { interval, unit: rule.unit };
  const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  if (weekdays.length === 7 && interval === 1) return { interval, unit: "day" };
  return { interval, unit: "week", weekdays };
}

export function validRecurrence(value: unknown): value is Recurrence {
  if (typeof value !== "object" || value === null) return false;
  const rule = value as Record<string, unknown>;
  const { interval, unit, weekdays } = rule;
  if (
    !Number.isInteger(interval) ||
    (interval as number) < 1 ||
    (interval as number) > 99 ||
    !["day", "week", "month", "year"].includes(unit as string)
  )
    return false;
  if (!("weekdays" in rule)) return true;
  return (
    unit === "week" &&
    Array.isArray(weekdays) &&
    weekdays.length > 0 &&
    weekdays.every(
      (day, i) => Number.isInteger(day) && day >= 0 && day <= 6 && (i === 0 || day > weekdays[i - 1]),
    )
  );
}

export function recurrenceKey(rule: Recurrence | null) {
  return rule ? `${rule.unit}:${rule.interval}:${rule.weekdays?.join(",") ?? ""}` : "";
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
// Monday-first display order.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function listLabel(items: string[]) {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function ordinal(day: number) {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

// "short" for chips and rows, "long" for menus and screen readers,
// "sentence" for the long form mid-sentence ("every week on Monday").
export function recurrenceLabel(
  rule: Recurrence,
  dueDate: string | null,
  form: "short" | "long" | "sentence" = "short",
): string {
  if (form === "sentence") {
    const label = recurrenceLabel(rule, dueDate, "long");
    return label.charAt(0).toLowerCase() + label.slice(1);
  }
  const anchor = dueDate ?? localDate();
  const every = `Every ${rule.interval > 1 ? `${rule.interval} ${rule.unit}s` : rule.unit}`;
  if (rule.unit === "day") return every;
  if (rule.unit === "month")
    return form === "short" ? every : `${every} on the ${ordinal(parseDate(anchor).getDate())}`;
  if (rule.unit === "year")
    return form === "short"
      ? every
      : `${every} on ${parseDate(anchor).toLocaleDateString("en", { month: "short", day: "numeric" })}`;
  const days = WEEK_ORDER.filter((day) =>
    (rule.weekdays ?? [weekday(anchor)]).includes(day),
  );
  const key = days.join(",");
  if (rule.interval === 1 && key === "1,2,3,4,5")
    return form === "short" ? "Every weekday" : "Every weekday (Mon–Fri)";
  if (rule.interval === 1 && key === "6,0")
    return form === "short" ? "Every weekend" : "Every weekend (Sat and Sun)";
  const names =
    form === "short"
      ? days.map((day) => WEEKDAY_SHORT[day]).join(", ")
      : listLabel(days.map((day) => WEEKDAY_LONG[day]));
  if (rule.interval > 1) return `${every} on ${names}`;
  return form === "short" ? `Every ${names}` : `Every week on ${names}`;
}

export const PRESET_RECURRENCES: Recurrence[] = [
  { interval: 1, unit: "day" },
  { interval: 1, unit: "week", weekdays: [1, 2, 3, 4, 5] },
  { interval: 1, unit: "week" },
  { interval: 1, unit: "month" },
  { interval: 1, unit: "year" },
];

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8))
  );
}

// View and project are independent filters, ready to become query parameters later.
export function matchesView(
  task: Task,
  view: View,
  today: string,
  projectId: string | null = null,
) {
  if (projectId !== null && task.project_id !== projectId) return false;
  if (view === "history") return task.completed_at !== null;
  if (task.completed_at !== null) return false;
  if (view === "all") return true;
  if (view === "today") return !!task.due_date && task.due_date <= today;
  if (view === "upcoming") return !!task.due_date && task.due_date > today;
  return false;
}

export const bySequence = (a: Task, b: Task) =>
  a.sequence - b.sequence || a.created_at.localeCompare(b.created_at);

// The manual order for a mixed list. A subtask shown without its parent sorts right after
// the place its parent would have.
export function manualOrder(tasks: Task[]) {
  const sequences = new Map(tasks.map((task) => [task.id, task.sequence]));
  const key = (task: Task) =>
    task.parent_id === null
      ? [task.sequence, -Infinity]
      : [sequences.get(task.parent_id) ?? task.sequence, task.sequence];
  return (a: Task, b: Task) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return a1 - b1 || a2 - b2 || a.created_at.localeCompare(b.created_at);
  };
}

// The tasks ordered alongside this one: top-level tasks, or the subtasks of its parent.
export const scopeOf = (tasks: Task[], task: Pick<Task, "parent_id">) =>
  tasks.filter((item) => item.parent_id === task.parent_id).sort(bySequence);

// The next sequence at the end of a scope.
export const nextSequence = (scope: Task[]) =>
  scope.reduce((max, task) => Math.max(max, task.sequence), 0) + 1;

// A sequence for a task inserted at `index` of `rest` (its scope without it, in order), or
// null when the neighbours are too close and the scope needs renumbering.
export function sequenceAt(rest: Task[], index: number) {
  const before = rest[index - 1]?.sequence;
  const after = rest[index]?.sequence;
  if (before === undefined) return after === undefined ? 1 : after - 1;
  if (after === undefined) return before + 1;
  return after - before > 1e-6 ? (before + after) / 2 : null;
}

// Subtasks in their manual order.
export function childrenOf(tasks: Task[], id: string) {
  return tasks.filter((task) => task.parent_id === id).sort(bySequence);
}

export function subtaskProgress(tasks: Task[], id: string) {
  const children = tasks.filter((task) => task.parent_id === id);
  return {
    done: children.filter((task) => task.completed_at).length,
    total: children.length,
  };
}

// A subtask as the composer edits it; an existing one keeps its id.
export type SubtaskDraft = { id?: string; title: string; description: string; done: boolean };
export const MAX_SUBTASKS = 50;

export type TaskEntry = { task: Task; parent: Task | null; subtasks: Task[] };

// Rows for a list. `listed` is what the view shows, already sorted. A shown top-level task
// carries all its subtasks that share its completion state, whether or not each matches the
// view. A listed subtask whose parent is shown is nested there; otherwise it stands alone,
// with its parent for a breadcrumb. No task appears twice.
export function nestTasks(
  listed: Task[],
  all: Task[],
  shownParents: ReadonlySet<string>,
): TaskEntry[] {
  return listed.flatMap((task): TaskEntry[] => {
    if (task.parent_id === null)
      return [
        {
          task,
          parent: null,
          subtasks: childrenOf(all, task.id).filter(
            (child) => !child.completed_at === !task.completed_at,
          ),
        },
      ];
    if (shownParents.has(task.parent_id)) return [];
    return [
      {
        task,
        parent: all.find((item) => item.id === task.parent_id) ?? null,
        subtasks: [],
      },
    ];
  });
}

export function seedSnapshot(): Snapshot {
  const now = new Date().toISOString();
  const projects = [
    { id: "personal", name: "Personal" },
    { id: "work", name: "Work" },
    { id: "learning", name: "Learning" },
  ];
  const items: Array<
    [string, string, string | null, number | null, Priority, boolean?, Recurrence?]
  > = [
    [
      "Make room for a little focus",
      "Choose the one thing that would make today feel like a good day.",
      "personal",
      0,
      1,
    ],
    [
      "Review the website direction",
      "A fresh pair of eyes before the next iteration.",
      "work",
      0,
      2,
    ],
    [
      "Spend 30 minutes learning something new",
      "Pick up where you left off. Small steps count.",
      "learning",
      0,
      3,
    ],
    ["Get outside for a walk", "", "personal", 0, null],
    [
      "Send the project update",
      "Share progress and the next steps.",
      "work",
      -1,
      2,
    ],
    ["Plan the week ahead", "", "personal", 1, 3, false, { interval: 1, unit: "week" }],
    [
      "Explore React Server Components",
      "Understand where the client meets the server.",
      "learning",
      2,
      2,
    ],
    ["Collect inspiration for the next project", "", "work", 3, null],
    ["Try that new coffee place", "", null, null, null],
    [
      "A book to read next",
      "Save a recommendation when something catches your eye.",
      null,
      null,
      null,
    ],
    ["Clear a little space on your desk", "", "personal", 0, null, true],
  ];
  const subtasks = ["Check the calendar", "Pick three priorities"].map((title, i) => ({
    id: `sample-child-${i}`,
    title,
    description: "",
    project_id: "personal",
    due_date: null,
    priority: null,
    recurrence: null,
    parent_id: "sample-5",
    sequence: i + 1,
    completed_at: null,
    created_at: now,
    updated_at: now,
  }));
  return {
    version: 5,
    projects,
    tasks: [
      ...items.map(
      ([title, description, projectId, offset, priority, done, recurrence], i) => ({
        id: `sample-${i}`,
        title,
        description,
        project_id: projectId,
        due_date: offset === null ? null : localDate(offset),
        priority,
        recurrence: recurrence ?? null,
        parent_id: null,
        sequence: i + 1,
        completed_at: done ? now : null,
        created_at: now,
        updated_at: now,
      })),
      ...subtasks,
    ],
  };
}

const LEGACY_KEYS: Record<string, string> = {
  projectId: "project_id",
  dueDate: "due_date",
  parentId: "parent_id",
  completedAt: "completed_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

// Saved tasks from before version 4 used camelCase keys.
function snakeCaseKeys(task: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(task).map(([key, value]) => [LEGACY_KEYS[key] ?? key, value]),
  );
}

export const STORAGE_KEY = "daybook.tasks.v1";

export function loadSnapshot(): Snapshot {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return seedSnapshot();
  const data = JSON.parse(raw);
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
  const timestamp = (value: unknown) =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  if (
    !record(data) ||
    ![1, 2, 3, 4, 5].includes(data.version as number) ||
    !Array.isArray(data.projects) ||
    !Array.isArray(data.tasks)
  )
    throw new Error("Invalid saved data");
  // Version 1 predates recurring tasks; version 2 predates subtasks; version 3 used camelCase
  // keys; version 4 predates the manual order.
  const version = data.version as number;
  const tasks: unknown[] = data.tasks.map((t: unknown) =>
    !record(t)
      ? t
      : {
          ...(version < 4 ? snakeCaseKeys(t) : t),
          ...(version < 2 && { recurrence: null }),
          ...(version < 3 && { parent_id: null }),
        },
  );
  if (version < 5) {
    // Lists keep the creation order they had.
    const scopes = new Map<unknown, Record<string, unknown>[]>();
    for (const t of tasks)
      if (record(t)) scopes.set(t.parent_id, [...(scopes.get(t.parent_id) ?? []), t]);
    for (const scope of scopes.values())
      scope
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .forEach((t, i) => {
          t.sequence = i + 1;
        });
  }
  if (
    !data.projects.every(
      (p: unknown) =>
        record(p) &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        p.name.trim(),
    )
  )
    throw new Error("Invalid projects");
  const projectIds = new Set(data.projects.map((p: Project) => p.id));
  if (projectIds.size !== data.projects.length)
    throw new Error("Duplicate projects");
  if (
    !tasks.every(
      (t: unknown) =>
        record(t) &&
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        t.title.trim() &&
        typeof t.description === "string" &&
        (t.project_id === null ||
          (typeof t.project_id === "string" && projectIds.has(t.project_id))) &&
        (t.due_date === null || isDate(t.due_date)) &&
        (t.priority === null || [1, 2, 3, 4].includes(t.priority as number)) &&
        (t.recurrence === null ||
          (validRecurrence(t.recurrence) && t.due_date !== null)) &&
        (t.parent_id === null || typeof t.parent_id === "string") &&
        Number.isFinite(t.sequence) &&
        (t.completed_at === null || timestamp(t.completed_at)) &&
        timestamp(t.created_at) &&
        timestamp(t.updated_at),
    )
  )
    throw new Error("Invalid tasks");
  const byId = new Map((tasks as Task[]).map((t) => [t.id, t]));
  if (byId.size !== tasks.length) throw new Error("Duplicate tasks");
  if (
    !(tasks as Task[]).every((t) => {
      if (t.parent_id === null) return true;
      const parent = byId.get(t.parent_id);
      return (
        !!parent &&
        parent.parent_id === null &&
        t.recurrence === null &&
        t.project_id === parent.project_id
      );
    })
  )
    throw new Error("Invalid subtasks");
  return { version: 5, projects: data.projects, tasks } as Snapshot;
}

export function saveSnapshot(snapshot: Snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
