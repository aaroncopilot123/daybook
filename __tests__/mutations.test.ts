import { describe, expect, it } from "vitest";
import {
  applyChanges,
  deleteProject,
  deleteTask,
  saveProject,
  saveTask,
  toggleTask,
  undoDelete,
  undoToggle,
  type Changes,
  type Clock,
} from "@/app/lib/mutations";
import { byCreated, type Project, type Snapshot, type Task, type TaskDraft } from "@/app/lib/tasks";

const NOW = "2026-10-20T09:00:00.000Z";
const TODAY = "2026-10-20";
const EARLIER = "2026-10-01T00:00:00.000Z";

function clock(): Clock {
  let count = 0;
  return { now: NOW, today: TODAY, newId: () => `new-${++count}` };
}

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: "",
    project_id: null,
    due_date: null,
    priority: null,
    recurrence: null,
    parent_id: null,
    completed_at: null,
    created_at: EARLIER,
    updated_at: EARLIER,
    deleted_at: null,
    ...fields,
  };
}

const snapshot = (tasks: Task[], projects: Project[] = []): Snapshot => ({
  version: 7,
  tasks,
  projects,
});

const draft = (fields: Partial<TaskDraft> = {}): TaskDraft => ({
  title: "Draft",
  description: "",
  project_id: null,
  due_date: null,
  priority: null,
  recurrence: null,
  parent_id: null,
  ...fields,
});

const find = (data: Snapshot, id: string) => data.tasks.find((item) => item.id === id)!;
const liveIds = (data: Snapshot) =>
  data.tasks.filter((item) => item.deleted_at === null).map((item) => item.id);
const changedIds = (changes: Changes) => changes.tasks.map((item) => item.id);
const order = (data: Snapshot, parentId: string | null = null) =>
  data.tasks
    .filter((item) => item.parent_id === parentId && item.deleted_at === null)
    .sort(byCreated)
    .map((item) => item.id);

describe("applyChanges", () => {
  it("updates rows in place, appends new ones and drops removed projects", () => {
    const data = snapshot([task("a"), task("b"), task("c")], [{ id: "p", name: "P" }]);
    const next = applyChanges(data, {
      tasks: [task("b", { title: "B!" }), task("d")],
      projects: [{ id: "q", name: "Q" }],
      removedProjects: ["p"],
    });
    expect(next.tasks.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(find(next, "b").title).toBe("B!");
    expect(next.projects).toEqual([{ id: "q", name: "Q" }]);
    expect(data.tasks).toHaveLength(3);
  });
});

describe("toggleTask", () => {
  const family = () =>
    snapshot([
      task("parent"),
      task("open", { parent_id: "parent" }),
      task("done", { parent_id: "parent", completed_at: EARLIER }),
      task("other"),
    ]);

  it("returns null for an unknown task", () => {
    expect(toggleTask(family(), "missing", clock())).toBeNull();
  });

  it("completes a parent and its open subtasks", () => {
    const data = family();
    const { changes, undo } = toggleTask(data, "parent", clock())!;
    expect(changedIds(changes).sort()).toEqual(["open", "parent"]);
    const next = applyChanges(data, changes);
    expect(find(next, "parent").completed_at).toBe(NOW);
    expect(find(next, "open").completed_at).toBe(NOW);
    expect(find(next, "done").completed_at).toBe(EARLIER);
    expect(undo.cascaded).toBe(1);
    expect(undo.spawned).toBeUndefined();
  });

  it("undo puts every changed task back", () => {
    const data = family();
    const { changes, undo } = toggleTask(data, "parent", clock())!;
    const done = applyChanges(data, changes);
    const back = applyChanges(done, undoToggle(done, undo, clock()).changes);
    expect(back.tasks.map(({ id, completed_at }) => ({ id, completed_at }))).toEqual(
      data.tasks.map(({ id, completed_at }) => ({ id, completed_at })),
    );
  });

  it("restoring a parent restores only the subtasks completed with it", () => {
    const data = snapshot([
      task("parent", { completed_at: NOW }),
      task("with", { parent_id: "parent", completed_at: NOW }),
      task("before", { parent_id: "parent", completed_at: EARLIER }),
    ]);
    const { changes, undo } = toggleTask(data, "parent", clock())!;
    const next = applyChanges(data, changes);
    expect(find(next, "parent").completed_at).toBeNull();
    expect(find(next, "with").completed_at).toBeNull();
    expect(find(next, "before").completed_at).toBe(EARLIER);
    expect(undo.cascaded).toBe(1);
  });

  it("restoring a subtask reopens its parent as a one-off", () => {
    const data = snapshot([
      task("parent", {
        completed_at: EARLIER,
        due_date: "2026-10-13",
        recurrence: { interval: 1, unit: "week" },
      }),
      task("child", { parent_id: "parent", completed_at: EARLIER }),
    ]);
    const { changes, undo } = toggleTask(data, "child", clock())!;
    const next = applyChanges(data, changes);
    expect(find(next, "parent")).toMatchObject({ completed_at: null, recurrence: null });
    expect(undo.reopenedParent).toBe(true);
  });

  it("completing a recurring task adds the next occurrence with fresh subtasks", () => {
    const data = snapshot([
      task("weekly", {
        due_date: TODAY,
        recurrence: { interval: 1, unit: "week" },
        project_id: "p",
      }),
      task("step", { parent_id: "weekly", project_id: "p", due_date: "2026-10-19" }),
    ]);
    const { changes, undo } = toggleTask(data, "weekly", clock())!;
    const next = applyChanges(data, changes);
    expect(undo.spawned).toEqual({ id: "new-1", dueDate: "2026-10-27", childIds: ["new-2"] });
    const spawned = find(next, "new-1");
    // Same snake_case shape as every other task.
    expect(Object.keys(spawned).sort()).toEqual(Object.keys(task("x")).sort());
    expect(spawned).toMatchObject({
      due_date: "2026-10-27",
      parent_id: null,
      // It keeps the original's creation time, and so its place in the list.
      created_at: EARLIER,
      completed_at: null,
      recurrence: { interval: 1, unit: "week" },
    });
    expect(find(next, "new-2")).toMatchObject({
      parent_id: "new-1",
      due_date: "2026-10-26",
      completed_at: null,
    });
    expect(find(next, "weekly").completed_at).toBe(NOW);
    expect(find(next, "step").completed_at).toBe(NOW);
  });

  it("undoing a recurring completion deletes the next occurrence", () => {
    const data = snapshot([
      task("weekly", { due_date: TODAY, recurrence: { interval: 1, unit: "week" } }),
      task("step", { parent_id: "weekly" }),
    ]);
    const { changes, undo } = toggleTask(data, "weekly", clock())!;
    const done = applyChanges(data, changes);
    const back = applyChanges(done, undoToggle(done, undo, clock()).changes);
    expect(liveIds(back)).toEqual(["weekly", "step"]);
    expect(find(back, "new-1").deleted_at).toBe(NOW);
    expect(find(back, "new-2").deleted_at).toBe(NOW);
    expect(find(back, "weekly").completed_at).toBeNull();
  });
});

describe("saveTask", () => {
  it("adds a new task, created now so it lists last", () => {
    const data = snapshot([task("a"), task("s", { parent_id: "a" })]);
    const saved = saveTask(data, draft({ title: "New" }), undefined, undefined, clock());
    expect(saved.id).toBe("new-1");
    expect(saved.changes.tasks).toEqual([
      task("new-1", { title: "New", created_at: NOW, updated_at: NOW }),
    ]);
    expect(order(applyChanges(data, saved.changes))).toEqual(["a", "new-1"]);
  });

  it("a new subtask takes its parent's project, never repeats and goes last", () => {
    const data = snapshot([
      task("p", { project_id: "work" }),
      task("s", { parent_id: "p", project_id: "work" }),
    ]);
    const saved = saveTask(
      data,
      draft({ parent_id: "p", recurrence: { interval: 1, unit: "day" }, due_date: TODAY }),
      undefined,
      undefined,
      clock(),
    );
    expect(saved.changes.tasks[0]).toMatchObject({
      parent_id: "p",
      project_id: "work",
      recurrence: null,
    });
    expect(order(applyChanges(data, saved.changes), "p")).toEqual(["s", "new-1"]);
  });

  it("a subtask can't be the parent of another task", () => {
    const data = snapshot([task("p"), task("s", { parent_id: "p" })]);
    const saved = saveTask(data, draft({ parent_id: "s" }), undefined, undefined, clock());
    expect(saved.changes.tasks[0].parent_id).toBeNull();
  });

  it("makes the subtasks match the composer's list", () => {
    const data = snapshot([
      task("p", { project_id: "home" }),
      task("one", { parent_id: "p", project_id: "home" }),
      task("two", { parent_id: "p", project_id: "home" }),
      task("three", { parent_id: "p", project_id: "home" }),
    ]);
    const saved = saveTask(
      data,
      draft({ title: "p", project_id: "work" }),
      "p",
      [
        { id: "three", title: " Three ", description: "note", done: false },
        { title: "Fresh", description: "", done: true },
        { title: "   ", description: "", done: false },
        { title: "Later", description: "", done: false },
        { id: "one", title: "", description: "", done: true },
      ],
      clock(),
    );
    expect(saved).toMatchObject({
      id: "p",
      moved: 2,
      added: ["new-1", "new-2"],
      completed: 1,
      removed: 1,
    });
    const next = applyChanges(data, saved.changes);
    // Kept subtasks stay in creation order; new ones follow in the order they were typed.
    expect(order(next, "p")).toEqual(["one", "three", "new-1", "new-2"]);
    expect(find(next, "three")).toMatchObject({
      title: "Three",
      description: "note",
      project_id: "work",
    });
    // An emptied title keeps the old one.
    expect(find(next, "one")).toMatchObject({ title: "one", completed_at: NOW });
    expect(find(next, "new-1")).toMatchObject({
      title: "Fresh",
      project_id: "work",
      completed_at: NOW,
    });
    // Removed subtasks become tombstones.
    expect(find(next, "two").deleted_at).toBe(NOW);
    expect(liveIds(next)).not.toContain("two");
    expect(find(next, "p").project_id).toBe("work");
  });

  it("leaves the subtasks alone without a list", () => {
    const data = snapshot([task("p"), task("s", { parent_id: "p" })]);
    const saved = saveTask(data, draft({ title: "Renamed" }), "p", undefined, clock());
    expect(changedIds(saved.changes)).toEqual(["p"]);
  });
});

describe("deleting", () => {
  it("deleting a task deletes it and its live subtasks, keeping them as tombstones", () => {
    const data = snapshot([
      task("p"),
      task("s", { parent_id: "p" }),
      task("gone", { parent_id: "p", deleted_at: EARLIER }),
      task("q"),
    ]);
    const { changes, undo } = deleteTask(data, "p", clock())!;
    expect(undo).toEqual({ ids: ["p", "s"] });
    const next = applyChanges(data, changes);
    expect(next.tasks).toHaveLength(4);
    expect(liveIds(next)).toEqual(["q"]);
    expect(find(next, "s")).toMatchObject({ deleted_at: NOW, updated_at: NOW });
    expect(find(next, "gone").deleted_at).toBe(EARLIER);
  });

  it("returns null for a task that's already deleted", () => {
    const data = snapshot([task("a", { deleted_at: EARLIER })]);
    expect(deleteTask(data, "a", clock())).toBeNull();
    expect(deleteTask(data, "missing", clock())).toBeNull();
  });

  it("undo brings back exactly what was deleted", () => {
    const data = snapshot([
      task("p"),
      task("s", { parent_id: "p" }),
      task("gone", { parent_id: "p", deleted_at: EARLIER }),
    ]);
    const { changes, undo } = deleteTask(data, "p", clock())!;
    const deleted = applyChanges(data, changes);
    const back = applyChanges(deleted, undoDelete(deleted, undo, clock()).changes);
    expect(liveIds(back)).toEqual(["p", "s"]);
    expect(find(back, "gone").deleted_at).toBe(EARLIER);
  });

  it("undo doesn't bring back a subtask whose parent is deleted", () => {
    const data = snapshot([
      task("p", { deleted_at: NOW }),
      task("s", { parent_id: "p", deleted_at: EARLIER }),
    ]);
    expect(undoDelete(data, { ids: ["s"] }, clock()).changes.tasks).toEqual([]);
  });

  it("deleted tasks take no part in cascades", () => {
    const data = snapshot([
      task("p"),
      task("dead-child", { parent_id: "p", deleted_at: EARLIER }),
    ]);
    const toggled = toggleTask(data, "p", clock())!;
    expect(changedIds(toggled.changes)).toEqual(["p"]);
  });

  it("deleting a project keeps its tasks, without a project", () => {
    const data = snapshot(
      [
        task("a", { project_id: "work" }),
        task("b", { project_id: "home" }),
        task("dead", { project_id: "work", deleted_at: EARLIER }),
      ],
      [
        { id: "work", name: "Work" },
        { id: "home", name: "Home" },
      ],
    );
    const { changes } = deleteProject(data, "work", clock());
    const next = applyChanges(data, changes);
    expect(next.projects).toEqual([{ id: "home", name: "Home" }]);
    expect(find(next, "a").project_id).toBeNull();
    // Tombstones let go of it too, so an Undo can't restore a task into a missing project.
    expect(changedIds(changes)).toEqual(["a", "dead"]);
  });
});

describe("saveProject", () => {
  const data = snapshot([], [{ id: "work", name: "Work" }]);

  it("adds or renames a project", () => {
    const added = saveProject(data, "Home", undefined, clock());
    expect(added.id).toBe("new-1");
    expect(applyChanges(data, added.changes).projects).toHaveLength(2);
    const renamed = saveProject(data, "Job", "work", clock());
    expect(applyChanges(data, renamed.changes).projects).toEqual([{ id: "work", name: "Job" }]);
  });

  it("ignores a project that no longer exists", () => {
    expect(saveProject(data, "Gone", "missing", clock()).changes.projects).toEqual([]);
  });
});
