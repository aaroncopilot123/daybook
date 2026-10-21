import { describe, expect, it } from "vitest";
import {
  applyChanges,
  deleteProject,
  deleteTask,
  moveTask,
  rescheduleTask,
  saveProject,
  saveTask,
  toggleTask,
  undoReschedule,
  undoToggle,
  type Changes,
  type Clock,
} from "@/app/lib/mutations";
import { bySequence, type Project, type Snapshot, type Task, type TaskDraft } from "@/app/lib/tasks";

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
    sequence: 1,
    completed_at: null,
    created_at: EARLIER,
    updated_at: EARLIER,
    ...fields,
  };
}

const snapshot = (tasks: Task[], projects: Project[] = []): Snapshot => ({
  version: 5,
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
const changedIds = (changes: Changes) => changes.tasks.map((item) => item.id);
const order = (data: Snapshot, parentId: string | null = null) =>
  data.tasks
    .filter((item) => item.parent_id === parentId)
    .sort(bySequence)
    .map((item) => item.id);

describe("applyChanges", () => {
  it("updates rows in place, appends new ones and drops removed ones", () => {
    const data = snapshot([task("a"), task("b"), task("c")], [{ id: "p", name: "P" }]);
    const next = applyChanges(data, {
      tasks: [task("b", { title: "B!" }), task("d")],
      removedTasks: ["c"],
      projects: [{ id: "q", name: "Q" }],
      removedProjects: ["p"],
    });
    expect(next.tasks.map((item) => item.id)).toEqual(["a", "b", "d"]);
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
      task("done", { parent_id: "parent", completed_at: EARLIER, sequence: 2 }),
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
        sequence: 3,
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
      sequence: 3,
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

  it("undoing a recurring completion removes the next occurrence", () => {
    const data = snapshot([
      task("weekly", { due_date: TODAY, recurrence: { interval: 1, unit: "week" } }),
      task("step", { parent_id: "weekly" }),
    ]);
    const { changes, undo } = toggleTask(data, "weekly", clock())!;
    const done = applyChanges(data, changes);
    const back = applyChanges(done, undoToggle(done, undo, clock()).changes);
    expect(back.tasks.map((item) => item.id)).toEqual(["weekly", "step"]);
    expect(find(back, "weekly").completed_at).toBeNull();
  });
});

describe("moveTask", () => {
  const four = () =>
    snapshot([
      task("a", { sequence: 1 }),
      task("b", { sequence: 2 }),
      task("c", { sequence: 3 }),
      task("d", { sequence: 4 }),
    ]);

  it("moving up lands right before the shown task below, past hidden tasks", () => {
    // The list shows a, c and d; b is hidden and keeps its place.
    const { changes, position } = moveTask(four(), "d", ["a", "d", "c"], clock())!;
    expect(position).toEqual({ position: 2, total: 3 });
    expect(changes.tasks).toEqual([task("d", { sequence: 2.5, updated_at: NOW })]);
    expect(order(applyChanges(four(), changes))).toEqual(["a", "b", "d", "c"]);
  });

  it("moving down lands right after the shown task above", () => {
    const { changes } = moveTask(four(), "a", ["c", "a", "d"], clock())!;
    expect(changes.tasks).toEqual([task("a", { sequence: 3.5, updated_at: NOW })]);
    expect(order(applyChanges(four(), changes))).toEqual(["b", "c", "a", "d"]);
  });

  it("moves to either end of the scope", () => {
    expect(moveTask(four(), "c", ["c", "a", "b", "d"], clock())!.changes.tasks[0].sequence).toBe(0);
    expect(moveTask(four(), "a", ["b", "c", "d", "a"], clock())!.changes.tasks[0].sequence).toBe(5);
  });

  it("changes nothing when the task stays put", () => {
    const moved = moveTask(four(), "b", ["a", "b", "c", "d"], clock())!;
    expect(moved.changes.tasks).toEqual([]);
    expect(moved.position).toEqual({ position: 2, total: 4 });
  });

  it("numbers the scope again when the gap is too small", () => {
    const data = snapshot([
      task("a", { sequence: 1 }),
      task("b", { sequence: 1 + 1e-7 }),
      task("c", { sequence: 2 }),
    ]);
    const { changes } = moveTask(data, "c", ["a", "c", "b"], clock())!;
    const next = applyChanges(data, changes);
    expect(order(next)).toEqual(["a", "c", "b"]);
    expect(next.tasks.map((item) => item.sequence)).toEqual([1, 3, 2]);
    // a and c already had those numbers.
    expect(changedIds(changes)).toEqual(["b"]);
  });

  it("only orders subtasks among their siblings", () => {
    const data = snapshot([
      task("p", { sequence: 1 }),
      task("x", { parent_id: "p", sequence: 1 }),
      task("y", { parent_id: "p", sequence: 2 }),
      task("q", { sequence: 2 }),
    ]);
    const { changes } = moveTask(data, "y", ["y", "x"], clock())!;
    expect(changes.tasks).toEqual([task("y", { parent_id: "p", sequence: 0, updated_at: NOW })]);
  });
});

describe("rescheduleTask", () => {
  const data = () =>
    snapshot([
      task("today", { due_date: TODAY, sequence: 1 }),
      task("later", { due_date: "2026-10-23", sequence: 2 }),
    ]);

  it("sets the date and keeps the order when it lands in place", () => {
    const { changes, undo } = rescheduleTask(data(), "later", TODAY, ["today", "later"], clock())!;
    expect(changes.tasks).toEqual([
      task("later", { due_date: TODAY, sequence: 2, updated_at: NOW }),
    ]);
    expect(undo).toEqual({
      id: "later",
      dueDate: TODAY,
      position: { position: 2, total: 2 },
      previous: [{ id: "later", due_date: "2026-10-23", sequence: 2 }],
    });
  });

  it("places it among the day's tasks", () => {
    const { changes } = rescheduleTask(data(), "later", TODAY, ["later", "today"], clock())!;
    expect(changes.tasks).toEqual([
      task("later", { due_date: TODAY, sequence: 0, updated_at: NOW }),
    ]);
  });

  it("returns null when the date doesn't change", () => {
    expect(rescheduleTask(data(), "today", TODAY, ["today"], clock())).toBeNull();
  });

  it("undo restores the date and the place", () => {
    const before = data();
    const { changes, undo } = rescheduleTask(before, "later", TODAY, ["later", "today"], clock())!;
    const moved = applyChanges(before, changes);
    const back = applyChanges(moved, undoReschedule(moved, undo, clock()).changes);
    expect(find(back, "later")).toMatchObject({ due_date: "2026-10-23", sequence: 2 });
  });
});

describe("saveTask", () => {
  it("adds a new task at the end of the top-level order", () => {
    const data = snapshot([task("a", { sequence: 4 }), task("s", { parent_id: "a", sequence: 9 })]);
    const saved = saveTask(data, draft({ title: "New" }), undefined, undefined, clock());
    expect(saved.id).toBe("new-1");
    expect(saved.changes.tasks).toEqual([
      task("new-1", { title: "New", sequence: 5, created_at: NOW, updated_at: NOW }),
    ]);
  });

  it("a new subtask takes its parent's project, never repeats and goes last", () => {
    const data = snapshot([
      task("p", { project_id: "work" }),
      task("s", { parent_id: "p", project_id: "work", sequence: 2 }),
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
      sequence: 3,
    });
  });

  it("a subtask can't be the parent of another task", () => {
    const data = snapshot([task("p"), task("s", { parent_id: "p" })]);
    const saved = saveTask(data, draft({ parent_id: "s" }), undefined, undefined, clock());
    expect(saved.changes.tasks[0].parent_id).toBeNull();
  });

  it("makes the subtasks match the composer's list", () => {
    const data = snapshot([
      task("p", { project_id: "home" }),
      task("one", { parent_id: "p", project_id: "home", sequence: 1 }),
      task("two", { parent_id: "p", project_id: "home", sequence: 2 }),
      task("three", { parent_id: "p", project_id: "home", sequence: 3 }),
    ]);
    const saved = saveTask(
      data,
      draft({ title: "p", project_id: "work" }),
      "p",
      [
        { id: "three", title: " Three ", description: "note", done: false },
        { title: "Fresh", description: "", done: true },
        { title: "   ", description: "", done: false },
        { id: "one", title: "", description: "", done: true },
      ],
      clock(),
    );
    expect(saved).toMatchObject({ id: "p", moved: 2, added: ["new-1"], completed: 1, removed: 1 });
    const next = applyChanges(data, saved.changes);
    expect(order(next, "p")).toEqual(["three", "new-1", "one"]);
    expect(find(next, "three")).toMatchObject({
      title: "Three",
      description: "note",
      project_id: "work",
    });
    // An emptied title keeps the old one.
    expect(find(next, "one")).toMatchObject({ title: "one", completed_at: NOW, sequence: 3 });
    expect(find(next, "new-1")).toMatchObject({
      title: "Fresh",
      project_id: "work",
      completed_at: NOW,
      sequence: 2,
    });
    expect(next.tasks.some((item) => item.id === "two")).toBe(false);
    expect(find(next, "p").project_id).toBe("work");
  });

  it("leaves the subtasks alone without a list", () => {
    const data = snapshot([task("p"), task("s", { parent_id: "p" })]);
    const saved = saveTask(data, draft({ title: "Renamed" }), "p", undefined, clock());
    expect(saved.changes.removedTasks).toEqual([]);
    expect(changedIds(saved.changes)).toEqual(["p"]);
  });
});

describe("deleting", () => {
  it("deleting a task deletes its subtasks only", () => {
    const data = snapshot([task("p"), task("s", { parent_id: "p" }), task("q")]);
    expect(deleteTask(data, "p").changes.removedTasks).toEqual(["p", "s"]);
  });

  it("deleting a project keeps its tasks, without a project", () => {
    const data = snapshot(
      [task("a", { project_id: "work" }), task("b", { project_id: "home" })],
      [
        { id: "work", name: "Work" },
        { id: "home", name: "Home" },
      ],
    );
    const { changes } = deleteProject(data, "work", clock());
    const next = applyChanges(data, changes);
    expect(next.projects).toEqual([{ id: "home", name: "Home" }]);
    expect(find(next, "a").project_id).toBeNull();
    expect(changedIds(changes)).toEqual(["a"]);
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
