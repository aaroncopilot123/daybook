import {
  addDays,
  daysBetween,
  isLive,
  nextDueDate,
  type Project,
  type Snapshot,
  type SubtaskDraft,
  type Task,
  type TaskDraft,
} from "./tasks";

// Every change to the data is a pure function of the snapshot: it returns the rows it
// changed, which the store applies with `applyChanges` and a backend can send as they are.
// Tasks are never removed: deleting one sets `deleted_at`, and only live tasks take part.

// What a mutation needs from outside: the current time, today's local date and new ids.
export type Clock = { now: string; today: string; newId: () => string };

// The rows a mutation inserted or changed, as they are after it, and the projects it removed.
export type Changes = {
  tasks: Task[];
  projects: Project[];
  removedProjects: string[];
};

// What toggleTask changed, so the toast's Undo can put it all back.
export type ToggleUndo = {
  id: string;
  // Every task the toggle changed, as it was before.
  previous: Array<Pick<Task, "id" | "completed_at" | "recurrence">>;
  // The next occurrence of a recurring task, with fresh copies of its subtasks.
  spawned?: { id: string; dueDate: string; childIds: string[] };
  // Subtasks completed or restored along with their parent.
  cascaded: number;
  // Restoring a subtask reopened its completed parent.
  reopenedParent: boolean;
};

// What deleteTask deleted, so the toast's Undo can bring it back.
export type DeleteUndo = { ids: string[] };

const changes = (part: Partial<Changes>): Changes => ({
  tasks: [],
  projects: [],
  removedProjects: [],
  ...part,
});

const live = (snapshot: Snapshot) => snapshot.tasks.filter(isLive);

const tombstone = (task: Task, now: string): Task => ({
  ...task,
  deleted_at: now,
  updated_at: now,
});

// Updates rows by id, appends new ones in order, and drops removed ones.
function upsert<T extends { id: string }>(rows: T[], changed: T[], removed: string[] = []) {
  const byId = new Map(changed.map((row) => [row.id, row]));
  const gone = new Set(removed);
  const existing = new Set(rows.map((row) => row.id));
  return [
    ...rows.filter((row) => !gone.has(row.id)).map((row) => byId.get(row.id) ?? row),
    ...changed.filter((row) => !existing.has(row.id) && !gone.has(row.id)),
  ];
}

export function applyChanges(snapshot: Snapshot, change: Changes): Snapshot {
  return {
    ...snapshot,
    tasks: upsert(snapshot.tasks, change.tasks),
    projects: upsert(snapshot.projects, change.projects, change.removedProjects),
  };
}

// Saves a task and, when `subtasks` is given, makes its subtasks match that final list:
// missing ones are deleted, kept ones edited and new ones added after them. Lists are in
// creation order, so a new task goes at the end of its list. Returns what changed, for the toast.
export function saveTask(
  snapshot: Snapshot,
  draft: TaskDraft,
  id: string | undefined,
  subtasks: SubtaskDraft[] | undefined,
  { now, newId }: Clock,
) {
  const tasks = live(snapshot);
  const taskId = id ?? newId();
  const existing = tasks.filter((task) => task.parent_id === taskId);
  // Subtasks hang off a top-level task, share its project and never repeat.
  const parent = existing.length
    ? undefined
    : tasks.find((task) => task.id === draft.parent_id && task.parent_id === null);
  const fixed: TaskDraft = {
    ...draft,
    parent_id: parent?.id ?? null,
    project_id: parent ? parent.project_id : draft.project_id,
    recurrence: parent ? null : draft.recurrence,
  };
  // A subtask can't have subtasks; without a list the subtasks stay as they are.
  const wanted = fixed.parent_id === null ? subtasks : undefined;
  const keptIds = new Set(wanted?.flatMap((line) => (line.id ? [line.id] : [])));
  const removed = wanted
    ? existing.filter((child) => !keptIds.has(child.id)).map((child) => child.id)
    : [];
  const edits = new Map<string, Partial<Task>>();
  let completed = 0;
  let reopened = 0;
  for (const line of wanted ?? []) {
    const child = existing.find((item) => item.id === line.id);
    if (!child) continue;
    const edit: Partial<Task> = {};
    // An emptied title keeps the old one.
    const title = line.title.trim();
    if (title && title !== child.title) edit.title = title;
    const description = line.description.trim();
    if (description !== child.description) edit.description = description;
    if (line.done && !child.completed_at) {
      edit.completed_at = now;
      completed++;
    } else if (!line.done && child.completed_at) {
      edit.completed_at = null;
      reopened++;
    }
    if (Object.keys(edit).length) edits.set(child.id, edit);
  }
  let moved = 0;
  for (const child of existing)
    if (!removed.includes(child.id) && child.project_id !== fixed.project_id) {
      edits.set(child.id, { ...edits.get(child.id), project_id: fixed.project_id });
      moved++;
    }
  const added: Task[] = (wanted ?? [])
    .filter((line) => !line.id && line.title.trim())
    .map((line, i) => ({
      id: newId(),
      title: line.title.trim(),
      description: line.description.trim(),
      project_id: fixed.project_id,
      due_date: null,
      priority: null,
      recurrence: null,
      parent_id: taskId,
      completed_at: line.done ? now : null,
      // A millisecond apart, so they keep the order they were typed in.
      created_at: new Date(Date.parse(now) + i + 1).toISOString(),
      updated_at: now,
      deleted_at: null,
    }));
  const task = id ? tasks.find((item) => item.id === id) : undefined;
  return {
    changes: changes({
      tasks: [
        ...(task ? [{ ...task, ...fixed, updated_at: now }] : []),
        ...existing.flatMap((child) => {
          if (removed.includes(child.id)) return [tombstone(child, now)];
          const edit = edits.get(child.id);
          return edit ? [{ ...child, ...edit, updated_at: now }] : [];
        }),
        ...(id
          ? []
          : [
              {
                ...fixed,
                id: taskId,
                completed_at: null,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              },
            ]),
        ...added,
      ],
    }),
    id: taskId,
    moved,
    added: added.map((item) => item.id),
    completed,
    reopened,
    removed: removed.length,
  };
}

// Completing a task completes its open subtasks; completing a recurring task logs this
// occurrence and adds the next one, with its subtasks reset. Restoring a task brings back
// the subtasks completed with it, and restoring a subtask reopens its parent. A restored
// past occurrence becomes a one-off so the series never doubles up.
export function toggleTask(snapshot: Snapshot, id: string, { now, today, newId }: Clock) {
  const tasks = live(snapshot);
  const task = tasks.find((item) => item.id === id);
  if (!task) return null;
  const children = tasks.filter((item) => item.parent_id === id);
  const parent = tasks.find((item) => item.id === task.parent_id);
  const edits = new Map<string, Partial<Task>>();
  let cascaded = 0;
  let reopenedParent = false;
  if (!task.completed_at) {
    edits.set(id, { completed_at: now });
    for (const child of children)
      if (!child.completed_at) {
        edits.set(child.id, { completed_at: now });
        cascaded++;
      }
  } else {
    edits.set(id, { completed_at: null, recurrence: null });
    for (const child of children)
      if (child.completed_at === task.completed_at) {
        edits.set(child.id, { completed_at: null });
        cascaded++;
      }
    if (parent?.completed_at) {
      edits.set(parent.id, { completed_at: null, recurrence: null });
      reopenedParent = true;
    }
  }
  const changed = tasks.filter((item) => edits.has(item.id));
  const undo: ToggleUndo = {
    id,
    previous: changed.map(({ id, completed_at, recurrence }) => ({
      id,
      completed_at,
      recurrence,
    })),
    cascaded,
    reopenedParent,
  };
  let spawned: Task[] = [];
  if (!task.completed_at && task.recurrence && task.due_date) {
    const dueDate = nextDueDate(task.recurrence, task.due_date, today);
    const shift = daysBetween(task.due_date, dueDate);
    // The next occurrence and its subtasks keep their creation times, and so their places.
    const next: Task = {
      ...task,
      id: newId(),
      due_date: dueDate,
      completed_at: null,
      updated_at: now,
    };
    const copies = children.map((child) => ({
      ...child,
      id: newId(),
      parent_id: next.id,
      due_date: child.due_date && addDays(child.due_date, shift),
      completed_at: null,
      updated_at: now,
    }));
    undo.spawned = { id: next.id, dueDate, childIds: copies.map((copy) => copy.id) };
    spawned = [next, ...copies];
  }
  return {
    changes: changes({
      tasks: [
        ...changed.map((item) => ({ ...item, ...edits.get(item.id), updated_at: now })),
        ...spawned,
      ],
    }),
    undo,
  };
}

// Puts the toggled tasks back and deletes the next occurrence it added.
export function undoToggle(snapshot: Snapshot, undo: ToggleUndo, { now }: Clock) {
  const previous = new Map(undo.previous.map((item) => [item.id, item]));
  const spawned = new Set(undo.spawned ? [undo.spawned.id, ...undo.spawned.childIds] : []);
  return {
    changes: changes({
      tasks: live(snapshot).flatMap((task) => {
        if (spawned.has(task.id)) return [tombstone(task, now)];
        const before = previous.get(task.id);
        return before ? [{ ...task, ...before, updated_at: now }] : [];
      }),
    }),
  };
}

// Deleting a task deletes its subtasks with it, and Undo brings back the same set.
export function deleteTask(snapshot: Snapshot, id: string, { now }: Clock) {
  const deleted = live(snapshot).filter((task) => task.id === id || task.parent_id === id);
  if (!deleted.some((task) => task.id === id)) return null;
  const undo: DeleteUndo = { ids: deleted.map((task) => task.id) };
  return { changes: changes({ tasks: deleted.map((task) => tombstone(task, now)) }), undo };
}

export function undoDelete(snapshot: Snapshot, undo: DeleteUndo, { now }: Clock) {
  const ids = new Set(undo.ids);
  const restored = snapshot.tasks.filter((task) => ids.has(task.id) && !isLive(task));
  const liveIds = new Set([...live(snapshot), ...restored].map((task) => task.id));
  return {
    changes: changes({
      tasks: restored
        // A subtask only comes back with its parent.
        .filter((task) => task.parent_id === null || liveIds.has(task.parent_id))
        .map((task) => ({ ...task, deleted_at: null, updated_at: now })),
    }),
  };
}

export function saveProject(
  { projects }: Snapshot,
  name: string,
  id: string | undefined,
  { newId }: Clock,
) {
  const projectId = id ?? newId();
  const known = !id || projects.some((project) => project.id === id);
  return {
    changes: changes({ projects: known ? [{ id: projectId, name }] : [] }),
    id: projectId,
  };
}

// Deleting a project keeps its tasks, without a project. Deleted tasks let go of it too, so
// an Undo can't bring back a task in a missing project.
export function deleteProject({ tasks }: Snapshot, id: string, { now }: Clock) {
  return {
    changes: changes({
      tasks: tasks.flatMap((task) =>
        task.project_id === id ? [{ ...task, project_id: null, updated_at: now }] : [],
      ),
      removedProjects: [id],
    }),
  };
}
