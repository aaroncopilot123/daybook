"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSnapshot,
  localDate,
  nextDueDate,
  saveSnapshot,
  newId,
  type Recurrence,
  type Snapshot,
  type TaskDraft,
} from "./tasks";

const emptySnapshot: Snapshot = { version: 2, tasks: [], projects: [] };

// What toggleTask changed, so the toast's Undo can put it back.
export type ToggleUndo = {
  id: string;
  completedAt: string | null;
  recurrence: Recurrence | null;
  spawned?: { id: string; dueDate: string };
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

  function saveTask(draft: TaskDraft, id?: string) {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      tasks: id
        ? current.tasks.map((task) =>
            task.id === id ? { ...task, ...draft, updatedAt: now } : task,
          )
        : [
            ...current.tasks,
            {
              ...draft,
              id: newId(),
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
    }));
  }

  // Completing a recurring task logs this occurrence and adds the next one;
  // restoring a past occurrence makes it a one-off so the series never doubles up.
  function toggleTask(id: string): ToggleUndo | null {
    const task = currentData.current.tasks.find((task) => task.id === id);
    if (!task) return null;
    const now = new Date().toISOString();
    const undo: ToggleUndo = {
      id,
      completedAt: task.completedAt,
      recurrence: task.recurrence,
    };
    if (!task.completedAt && task.recurrence && task.dueDate)
      undo.spawned = {
        id: newId(),
        dueDate: nextDueDate(task.recurrence, task.dueDate, localDate()),
      };
    const spawned = undo.spawned;
    commit((current) => ({
      ...current,
      tasks: [
        ...current.tasks.map((item) =>
          item.id === id
            ? {
                ...item,
                completedAt: item.completedAt ? null : now,
                recurrence: item.completedAt ? null : item.recurrence,
                updatedAt: now,
              }
            : item,
        ),
        ...(spawned
          ? [
              {
                ...task,
                id: spawned.id,
                dueDate: spawned.dueDate,
                completedAt: null,
                updatedAt: now,
              },
            ]
          : []),
      ],
    }));
    return undo;
  }

  function undoToggle(undo: ToggleUndo) {
    commit((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== undo.spawned?.id)
        .map((task) =>
          task.id === undo.id
            ? {
                ...task,
                completedAt: undo.completedAt,
                recurrence: undo.recurrence,
                updatedAt: new Date().toISOString(),
              }
            : task,
        ),
    }));
  }

  function deleteTask(id: string) {
    commit((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
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
