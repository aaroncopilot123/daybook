"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSnapshot,
  saveSnapshot,
  newId,
  type Snapshot,
  type TaskDraft,
} from "./tasks";

const emptySnapshot: Snapshot = { version: 1, tasks: [], projects: [] };

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

  function toggleTask(id: string) {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              completedAt: task.completedAt ? null : now,
              updatedAt: now,
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
    deleteTask,
    saveProject,
    deleteProject,
  };
}
