export type Priority = 1 | 2 | 3 | 4 | null;
export type Task = {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  dueDate: string | null;
  priority: Priority;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Project = { id: string; name: string };
export type TaskDraft = Pick<
  Task,
  "title" | "description" | "projectId" | "dueDate" | "priority"
>;
export type Snapshot = { version: 1; tasks: Task[]; projects: Project[] };
export type View = "all" | "today" | "upcoming" | "history" | "projects";

export function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateLabel(value: string) {
  if (value === localDate()) return "Today";
  if (value === localDate(1)) return "Tomorrow";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

export function dayLabel(value: string) {
  const label = dateLabel(value);
  if (label === "Today" || label === "Tomorrow") return label;
  return new Date(`${value}T12:00:00`).toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// A weekday always means the next one, 1–7 days ahead.
export function nextWeekday(day: number) {
  return localDate((day - new Date().getDay() + 7) % 7 || 7);
}

const DATE_WORDS: Record<string, () => string> = {
  today: () => localDate(),
  tod: () => localDate(),
  tomorrow: () => localDate(1),
  tmr: () => localDate(1),
  sun: () => nextWeekday(0),
  sunday: () => nextWeekday(0),
  mon: () => nextWeekday(1),
  monday: () => nextWeekday(1),
  tue: () => nextWeekday(2),
  tues: () => nextWeekday(2),
  tuesday: () => nextWeekday(2),
  wed: () => nextWeekday(3),
  wednesday: () => nextWeekday(3),
  thu: () => nextWeekday(4),
  thur: () => nextWeekday(4),
  thurs: () => nextWeekday(4),
  thursday: () => nextWeekday(4),
  fri: () => nextWeekday(5),
  friday: () => nextWeekday(5),
  sat: () => nextWeekday(6),
  saturday: () => nextWeekday(6),
};
const DATE_WORD_PATTERN = `(?<![\\p{L}\\p{N}])(${Object.keys(DATE_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|")})(?![\\p{L}\\p{N}])`;

export type DateToken = { start: number; end: number; text: string; date: string };

// The last whole-word date in a title, e.g. "mon" in "Call mum mon" but not in "money".
export function findDateToken(title: string): DateToken | null {
  let token: DateToken | null = null;
  for (const match of title.matchAll(new RegExp(DATE_WORD_PATTERN, "giu"))) {
    token = {
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      date: DATE_WORDS[match[0].toLowerCase()](),
    };
  }
  return token;
}

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
  if (projectId !== null && task.projectId !== projectId) return false;
  if (view === "history") return task.completedAt !== null;
  if (task.completedAt !== null) return false;
  if (view === "all") return true;
  if (view === "today") return !!task.dueDate && task.dueDate <= today;
  if (view === "upcoming") return !!task.dueDate && task.dueDate > today;
  return false;
}

export function seedSnapshot(): Snapshot {
  const now = new Date().toISOString();
  const projects = [
    { id: "personal", name: "Personal" },
    { id: "work", name: "Work" },
    { id: "learning", name: "Learning" },
  ];
  const items: Array<
    [string, string, string | null, number | null, Priority, boolean?]
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
    ["Plan the week ahead", "", "personal", 1, 3],
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
  return {
    version: 1,
    projects,
    tasks: items.map(
      ([title, description, projectId, offset, priority, done], i) => ({
        id: `sample-${i}`,
        title,
        description,
        projectId,
        dueDate: offset === null ? null : localDate(offset),
        priority,
        completedAt: done ? now : null,
        createdAt: now,
        updatedAt: now,
      }),
    ),
  };
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
    data.version !== 1 ||
    !Array.isArray(data.projects) ||
    !Array.isArray(data.tasks)
  )
    throw new Error("Invalid saved data");
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
    !data.tasks.every(
      (t: unknown) =>
        record(t) &&
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        t.title.trim() &&
        typeof t.description === "string" &&
        (t.projectId === null ||
          (typeof t.projectId === "string" && projectIds.has(t.projectId))) &&
        (t.dueDate === null || isDate(t.dueDate)) &&
        (t.priority === null || [1, 2, 3, 4].includes(t.priority as number)) &&
        (t.completedAt === null || timestamp(t.completedAt)) &&
        timestamp(t.createdAt) &&
        timestamp(t.updatedAt),
    )
  )
    throw new Error("Invalid tasks");
  if (new Set(data.tasks.map((t: Task) => t.id)).size !== data.tasks.length)
    throw new Error("Duplicate tasks");
  return data as Snapshot;
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
