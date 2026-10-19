"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  daysBetween,
  loadSnapshot,
  localDate,
  nextDueDate,
  saveSnapshot,
  newId,
  type Snapshot,
  type SubtaskDraft,
  type Task,
  type TaskDraft,
} from "./tasks";

const emptySnapshot: Snapshot = { version: 3, tasks: [], projects: [] };

// What toggleTask changed, so the toast's Undo can put it all back.
export type ToggleUndo = {
  id: string;
  // Every task the toggle changed, as it was before.
  previous: Array<Pick<Task, "id" | "completedAt" | "recurrence">>;
  // The next occurrence of a recurring task, with fresh copies of its subtasks.
  spawned?: { id: string; dueDate: string; childIds: string[] };
  // Subtasks completed or restored along with their parent.
  cascaded: number;
  // Restoring a subtask reopened its completed parent.
  reopenedParent: boolean;
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
  // missing ones are deleted, kept ones renamed or ticked, new ones added in the typed order.
  // Returns what changed, for the toast.
  function saveTask(draft: TaskDraft, id?: string, subtasks?: SubtaskDraft[]) {
    const now = new Date().toISOString();
    const tasks = currentData.current.tasks;
    const taskId = id ?? newId();
    const existing = tasks.filter((task) => task.parentId === taskId);
    // Subtasks hang off a top-level task, share its project and never repeat.
    const parent = existing.length
      ? undefined
      : tasks.find((task) => task.id === draft.parentId && task.parentId === null);
    const fixed: TaskDraft = {
      ...draft,
      parentId: parent?.id ?? null,
      projectId: parent ? parent.projectId : draft.projectId,
      recurrence: parent ? null : draft.recurrence,
    };
    // A subtask can't have subtasks; without a list the subtasks stay as they are.
    const wanted = fixed.parentId === null ? subtasks : undefined;
    const keptIds = new Set(wanted?.flatMap((line) => (line.id ? [line.id] : [])));
    const removed = new Set(
      wanted ? existing.filter((child) => !keptIds.has(child.id)).map((child) => child.id) : [],
    );
    const changes = new Map<string, Partial<Task>>();
    let completed = 0;
    let reopened = 0;
    for (const line of wanted ?? []) {
      const child = existing.find((item) => item.id === line.id);
      if (!child) continue;
      const change: Partial<Task> = {};
      // An emptied title keeps the old one.
      const title = line.title.trim();
      if (title && title !== child.title) change.title = title;
      if (line.done && !child.completedAt) {
        change.completedAt = now;
        completed++;
      } else if (!line.done && child.completedAt) {
        change.completedAt = null;
        reopened++;
      }
      if (Object.keys(change).length) changes.set(child.id, change);
    }
    let moved = 0;
    for (const child of existing)
      if (!removed.has(child.id) && child.projectId !== fixed.projectId) {
        changes.set(child.id, { ...changes.get(child.id), projectId: fixed.projectId });
        moved++;
      }
    const added: Task[] = (wanted ?? [])
      .filter((line) => !line.id && line.title.trim())
      .map((line, i) => ({
        id: newId(),
        title: line.title.trim(),
        description: "",
        projectId: fixed.projectId,
        dueDate: null,
        priority: null,
        recurrence: null,
        parentId: taskId,
        completedAt: line.done ? now : null,
        // A millisecond apart, so they keep the order they were typed in.
        createdAt: new Date(Date.parse(now) + i + 1).toISOString(),
        updatedAt: now,
      }));
    commit((current) => ({
      ...current,
      tasks: [
        ...current.tasks
          .filter((task) => !removed.has(task.id))
          .map((task) => {
            if (id && task.id === id) return { ...task, ...fixed, updatedAt: now };
            const change = changes.get(task.id);
            return change ? { ...task, ...change, updatedAt: now } : task;
          }),
        ...(id
          ? []
          : [{ ...fixed, id: taskId, completedAt: null, createdAt: now, updatedAt: now }]),
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
    const children = tasks.filter((item) => item.parentId === id);
    const parent = tasks.find((item) => item.id === task.parentId);
    const changes = new Map<string, Partial<Task>>();
    let cascaded = 0;
    let reopenedParent = false;
    if (!task.completedAt) {
      changes.set(id, { completedAt: now });
      for (const child of children)
        if (!child.completedAt) {
          changes.set(child.id, { completedAt: now });
          cascaded++;
        }
    } else {
      changes.set(id, { completedAt: null, recurrence: null });
      for (const child of children)
        if (child.completedAt === task.completedAt) {
          changes.set(child.id, { completedAt: null });
          cascaded++;
        }
      if (parent?.completedAt) {
        changes.set(parent.id, { completedAt: null, recurrence: null });
        reopenedParent = true;
      }
    }
    const undo: ToggleUndo = {
      id,
      previous: tasks
        .filter((item) => changes.has(item.id))
        .map(({ id, completedAt, recurrence }) => ({ id, completedAt, recurrence })),
      cascaded,
      reopenedParent,
    };
    let spawnedTasks: Task[] = [];
    if (!task.completedAt && task.recurrence && task.dueDate) {
      const dueDate = nextDueDate(task.recurrence, task.dueDate, localDate());
      const shift = daysBetween(task.dueDate, dueDate);
      const next = { ...task, id: newId(), dueDate, completedAt: null, updatedAt: now };
      const copies = children.map((child) => ({
        ...child,
        id: newId(),
        parentId: next.id,
        dueDate: child.dueDate && addDays(child.dueDate, shift),
        completedAt: null,
        updatedAt: now,
      }));
      undo.spawned = { id: next.id, dueDate, childIds: copies.map((copy) => copy.id) };
      spawnedTasks = [next, ...copies];
    }
    commit((current) => ({
      ...current,
      tasks: [
        ...current.tasks.map((item) => {
          const change = changes.get(item.id);
          return change ? { ...item, ...change, updatedAt: now } : item;
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
          return before ? { ...task, ...before, updatedAt: now } : task;
        }),
    }));
  }

  // Deleting a task deletes its subtasks.
  function deleteTask(id: string) {
    commit((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id && task.parentId !== id),
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
        task.projectId === id
          ? { ...task, projectId: null, updatedAt: new Date().toISOString() }
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
    deleteTask,
    saveProject,
    deleteProject,
  };
}
