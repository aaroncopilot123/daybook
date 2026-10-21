"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isLive,
  loadSnapshot,
  localDate,
  saveSnapshot,
  newId,
  type Snapshot,
  type SubtaskDraft,
  type TaskDraft,
} from "./tasks";
import * as mutations from "./mutations";
import type { Changes, Clock, DeleteUndo, ScheduleUndo, ToggleUndo } from "./mutations";

const emptySnapshot: Snapshot = { version: 6, tasks: [], projects: [] };

const clock = (): Clock => ({ now: new Date().toISOString(), today: localDate(), newId });

export function useTasks() {
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const currentData = useRef(data);
  const canSave = useRef(false);
  // Deleted tasks stay in the snapshot as tombstones; the app only sees live ones.
  const tasks = useMemo(() => data.tasks.filter(isLive), [data.tasks]);

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

  // Applies a mutation's changed rows and saves the result.
  function commit(changes: Changes) {
    const next = mutations.applyChanges(currentData.current, changes);
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

  function saveTask(draft: TaskDraft, id?: string, subtasks?: SubtaskDraft[]) {
    const { changes, ...saved } = mutations.saveTask(
      currentData.current,
      draft,
      id,
      subtasks,
      clock(),
    );
    commit(changes);
    return saved;
  }

  function toggleTask(id: string): ToggleUndo | null {
    const toggled = mutations.toggleTask(currentData.current, id, clock());
    if (!toggled) return null;
    commit(toggled.changes);
    return toggled.undo;
  }

  function undoToggle(undo: ToggleUndo) {
    commit(mutations.undoToggle(currentData.current, undo, clock()).changes);
  }

  function moveTask(id: string, order: string[]) {
    const moved = mutations.moveTask(currentData.current, id, order, clock());
    if (!moved) return null;
    commit(moved.changes);
    return moved.position;
  }

  function rescheduleTask(id: string, dueDate: string, order: string[]): ScheduleUndo | null {
    const moved = mutations.rescheduleTask(currentData.current, id, dueDate, order, clock());
    if (!moved) return null;
    commit(moved.changes);
    return moved.undo;
  }

  function undoReschedule(undo: ScheduleUndo) {
    commit(mutations.undoReschedule(currentData.current, undo, clock()).changes);
  }

  function deleteTask(id: string): DeleteUndo | null {
    const deleted = mutations.deleteTask(currentData.current, id, clock());
    if (!deleted) return null;
    commit(deleted.changes);
    return deleted.undo;
  }

  function undoDelete(undo: DeleteUndo) {
    commit(mutations.undoDelete(currentData.current, undo, clock()).changes);
  }

  function saveProject(name: string, id?: string) {
    const saved = mutations.saveProject(currentData.current, name, id, clock());
    commit(saved.changes);
    return saved.id;
  }

  function deleteProject(id: string) {
    commit(mutations.deleteProject(currentData.current, id, clock()).changes);
  }

  return {
    ...data,
    tasks,
    ready,
    storageError,
    saveTask,
    toggleTask,
    undoToggle,
    moveTask,
    rescheduleTask,
    undoReschedule,
    deleteTask,
    undoDelete,
    saveProject,
    deleteProject,
  };
}
