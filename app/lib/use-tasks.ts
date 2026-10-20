"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  daysBetween,
  loadSnapshot,
  localDate,
  nextDueDate,
  nextSequence,
  saveSnapshot,
  scopeOf,
  sequenceAt,
  newId,
  type Snapshot,
  type SubtaskDraft,
  type Task,
  type TaskDraft,
} from "./tasks";

const emptySnapshot: Snapshot = { version: 5, tasks: [], projects: [] };

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

// What rescheduleTask changed, so the toast's Undo can put it back.
export type ScheduleUndo = {
  id: string;
  dueDate: string;
  // The task's new position among the shown tasks of the list it landed in.
  position: { position: number; total: number };
  // Every task the move changed, as it was before.
  previous: Array<Pick<Task, "id" | "due_date" | "sequence">>;
};

export function useTasks() {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const currentData = useRef(data);
  const canSave = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Defer browser storage until hydration finishes. Strict Mode cancels the first pass.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const loaded = loadSnapshot();
        currentData.current = loaded;
        setData(loaded);
        canSave.current = true;
        try {
          saveSnapshot(loaded);
        } catch {
          setStorageError(
            "Your browser could not save your tasks. Changes will only be available in this session.",
          );
        }
      } catch {
        setStorageError(
          "Saved tasks could not be loaded. You can work in this temporary session; your existing saved data will not be overwritten.",
        );
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function commit(update: (current: Snapshot) => Snapshot) {
    const next = update(currentData.current);
    currentData.current = next;
    setData(next);
    if (!canSave.current) return;
    try {
      saveSnapshot(next);
      setStorageError("");
    } catch {
      setStorageError(
        "Your browser could not save these changes. Your tasks are available in this session, but may be lost when you leave.",
      );
    }
  }

  // Saves a task and, when `subtasks` is given, makes its subtasks match that final list:
  // missing ones are deleted, kept ones edited, new ones added, all in the list's order.
  // A new task goes at the end of its list. Returns what changed, for the toast.
  function saveTask(draft: TaskDraft, id?: string, subtasks?: SubtaskDraft[]) {
    const now = new Date().toISOString();
    const tasks = currentData.current.tasks;
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
    const removed = new Set(
      wanted ? existing.filter((child) => !keptIds.has(child.id)).map((child) => child.id) : [],
    );
    const changes = new Map<string, Partial<Task>>();
    let completed = 0;
    let reopened = 0;
    // Subtasks take their place in the list; lines without a title are skipped.
    const sequences = new Map(
      (wanted ?? [])
        .filter((line) => line.id || line.title.trim())
        .map((line, i) => [line, i + 1]),
    );
    for (const line of wanted ?? []) {
      const child = existing.find((item) => item.id === line.id);
      if (!child) continue;
      const change: Partial<Task> = {};
      // An emptied title keeps the old one.
      const title = line.title.trim();
      if (title && title !== child.title) change.title = title;
      const description = line.description.trim();
      if (description !== child.description) change.description = description;
      const sequence = sequences.get(line)!;
      if (sequence !== child.sequence) change.sequence = sequence;
      if (line.done && !child.completed_at) {
        change.completed_at = now;
        completed++;
      } else if (!line.done && child.completed_at) {
        change.completed_at = null;
        reopened++;
      }
      if (Object.keys(change).length) changes.set(child.id, change);
    }
    let moved = 0;
    for (const child of existing)
      if (!removed.has(child.id) && child.project_id !== fixed.project_id) {
        changes.set(child.id, { ...changes.get(child.id), project_id: fixed.project_id });
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
        sequence: sequences.get(line)!,
        completed_at: line.done ? now : null,
        // A millisecond apart, so they keep the order they were typed in.
        created_at: new Date(Date.parse(now) + i + 1).toISOString(),
        updated_at: now,
      }));
    commit((current) => ({
      ...current,
      tasks: [
        ...current.tasks
          .filter((task) => !removed.has(task.id))
          .map((task) => {
            if (id && task.id === id) return { ...task, ...fixed, updated_at: now };
            const change = changes.get(task.id);
            return change ? { ...task, ...change, updated_at: now } : task;
          }),
        ...(id
          ? []
          : [
              {
                ...fixed,
                id: taskId,
                sequence: nextSequence(scopeOf(current.tasks, fixed)),
                completed_at: null,
                created_at: now,
                updated_at: now,
              },
            ]),
        ...added,
      ],
    }));
    return {
      id: taskId,
      moved,
      added: added.map((task) => task.id),
      completed,
      reopened,
      removed: removed.size,
    };
  }

  // Completing a task completes its open subtasks; completing a recurring task logs this
  // occurrence and adds the next one, with its subtasks reset. Restoring a task brings back
  // the subtasks completed with it, and restoring a subtask reopens its parent. A restored
  // past occurrence becomes a one-off so the series never doubles up.
  function toggleTask(id: string): ToggleUndo | null {
    const tasks = currentData.current.tasks;
    const task = tasks.find((item) => item.id === id);
    if (!task) return null;
    const now = new Date().toISOString();
    const children = tasks.filter((item) => item.parent_id === id);
    const parent = tasks.find((item) => item.id === task.parent_id);
    const changes = new Map<string, Partial<Task>>();
    let cascaded = 0;
    let reopenedParent = false;
    if (!task.completed_at) {
      changes.set(id, { completed_at: now });
      for (const child of children)
        if (!child.completed_at) {
          changes.set(child.id, { completed_at: now });
          cascaded++;
        }
    } else {
      changes.set(id, { completed_at: null, recurrence: null });
      for (const child of children)
        if (child.completed_at === task.completed_at) {
          changes.set(child.id, { completed_at: null });
          cascaded++;
        }
      if (parent?.completed_at) {
        changes.set(parent.id, { completed_at: null, recurrence: null });
        reopenedParent = true;
      }
    }
    const undo: ToggleUndo = {
      id,
      previous: tasks
        .filter((item) => changes.has(item.id))
        .map(({ id, completed_at, recurrence }) => ({ id, completed_at, recurrence })),
      cascaded,
      reopenedParent,
    };
    let spawnedTasks: Task[] = [];
    if (!task.completed_at && task.recurrence && task.due_date) {
      const dueDate = nextDueDate(task.recurrence, task.due_date, localDate());
      const shift = daysBetween(task.due_date, dueDate);
      // The next occurrence and its subtasks keep their places in the order.
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
      spawnedTasks = [next, ...copies];
    }
    commit((current) => ({
      ...current,
      tasks: [
        ...current.tasks.map((item) => {
          const change = changes.get(item.id);
          return change ? { ...item, ...change, updated_at: now } : item;
        }),
        ...spawnedTasks,
      ],
    }));
    return undo;
  }

  function undoToggle(undo: ToggleUndo) {
    const removed = new Set([undo.spawned?.id, ...(undo.spawned?.childIds ?? [])]);
    const previous = new Map(undo.previous.map((item) => [item.id, item]));
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => !removed.has(task.id))
        .map((task) => {
          const before = previous.get(task.id);
          return before ? { ...task, ...before, updated_at: now } : task;
        }),
    }));
  }

  // Where a task lands in a list. `order` is that list's ids with the task in its new place,
  // whether it moved within the list or came from another one. Only tasks in the same scope
  // count: the task lands right after the shown task above it (moving down) or right before
  // the shown task below it (moving up), and tasks the list doesn't show keep their places.
  // Returns its position among the shown tasks and the sequences that change.
  function place(task: Task, order: string[]) {
    const scope = scopeOf(currentData.current.tasks, task);
    const shownIds = new Set(order);
    const before = scope.filter((item) => shownIds.has(item.id)).map((item) => item.id);
    const after = order.filter((item) => before.includes(item));
    const from = before.indexOf(task.id);
    const to = after.indexOf(task.id);
    const position = { position: to + 1, total: after.length };
    if (from < 0 || from === to) return { position, sequences: new Map<string, number>() };
    const rest = scope.filter((item) => item.id !== task.id);
    const anchor = to > from ? after[to - 1] : after[to + 1];
    const index = rest.findIndex((item) => item.id === anchor) + (to > from ? 1 : 0);
    const sequence = sequenceAt(rest, index);
    // Too close to fit between: number the whole scope again.
    const sequences = new Map(
      sequence === null
        ? [...rest.slice(0, index), task, ...rest.slice(index)].map((item, i) => [item.id, i + 1])
        : [[task.id, sequence]],
    );
    return { position, sequences };
  }

  // Moves a task within the list it's shown in. `order` is that list's ids after the move.
  // Returns its new position among the shown tasks.
  function moveTask(id: string, order: string[]) {
    const task = currentData.current.tasks.find((item) => item.id === id);
    if (!task) return null;
    const { position, sequences } = place(task, order);
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((item) => {
        const next = sequences.get(item.id);
        return next === undefined || next === item.sequence
          ? item
          : { ...item, sequence: next, updated_at: now };
      }),
    }));
    return position;
  }

  // Moves a task into another day's list: it becomes due that day and lands in `order`, that
  // list's ids with the task in its new place. Only the task's own date changes; a recurring
  // task's series continues from the new date, and its subtasks keep their dates.
  function rescheduleTask(id: string, dueDate: string, order: string[]): ScheduleUndo | null {
    const tasks = currentData.current.tasks;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.due_date === dueDate) return null;
    const { position, sequences } = place(task, order);
    const changed = new Set([id, ...sequences.keys()]);
    const undo: ScheduleUndo = {
      id,
      dueDate,
      position,
      previous: tasks
        .filter((item) => changed.has(item.id))
        .map(({ id, due_date, sequence }) => ({ id, due_date, sequence })),
    };
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((item) => {
        if (!changed.has(item.id)) return item;
        const sequence = sequences.get(item.id) ?? item.sequence;
        if (item.id === id) return { ...item, due_date: dueDate, sequence, updated_at: now };
        return sequence === item.sequence ? item : { ...item, sequence, updated_at: now };
      }),
    }));
    return undo;
  }

  function undoReschedule(undo: ScheduleUndo) {
    const previous = new Map(undo.previous.map((item) => [item.id, item]));
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        const before = previous.get(task.id);
        return before ? { ...task, ...before, updated_at: now } : task;
      }),
    }));
  }

  // Deleting a task deletes its subtasks.
  function deleteTask(id: string) {
    commit((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id && task.parent_id !== id),
    }));
  }

  function saveProject(name: string, id?: string) {
    const projectId = id ?? newId();
    commit((current) => ({
      ...current,
      projects: id
        ? current.projects.map((project) =>
            project.id === id ? { ...project, name } : project,
          )
        : [...current.projects, { id: projectId, name }],
    }));
    return projectId;
  }

  function deleteProject(id: string) {
    commit((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== id),
      tasks: current.tasks.map((task) =>
        task.project_id === id
          ? { ...task, project_id: null, updated_at: new Date().toISOString() }
          : task,
      ),
    }));
  }

  return {
    ...data,
    ready,
    storageError,
    saveTask,
    toggleTask,
    undoToggle,
    moveTask,
    rescheduleTask,
    undoReschedule,
    deleteTask,
    saveProject,
    deleteProject,
  };
}
