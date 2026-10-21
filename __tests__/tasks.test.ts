import { describe, expect, it } from "vitest";
import {
  manualOrder,
  matchesView,
  nestTasks,
  parseSnapshot,
  sequenceAt,
  type Task,
} from "@/app/lib/tasks";

const TODAY = "2026-10-20";
const EARLIER = "2026-10-01T00:00:00.000Z";

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
    deleted_at: null,
    ...fields,
  };
}

describe("matchesView", () => {
  const overdue = task("overdue", { due_date: "2026-10-19" });
  const today = task("today", { due_date: TODAY, project_id: "work" });
  const later = task("later", { due_date: "2026-10-21" });
  const undated = task("undated");
  const done = task("done", { due_date: TODAY, completed_at: EARLIER });
  const all = [overdue, today, later, undated, done];
  const ids = (view: Parameters<typeof matchesView>[1], projectId: string | null = null) =>
    all.filter((item) => matchesView(item, view, TODAY, projectId)).map((item) => item.id);

  it("All tasks shows every open task", () => {
    expect(ids("all")).toEqual(["overdue", "today", "later", "undated"]);
  });

  it("Today shows open tasks due today or earlier", () => {
    expect(ids("today")).toEqual(["overdue", "today"]);
  });

  it("History shows completed tasks", () => {
    expect(ids("history")).toEqual(["done"]);
  });

  it("the project filter applies on top of the view", () => {
    expect(ids("all", "work")).toEqual(["today"]);
    expect(ids("history", "work")).toEqual([]);
  });
});

describe("sequenceAt", () => {
  const rest = [task("a", { sequence: 1 }), task("b", { sequence: 2 })];

  it("goes before the first, after the last, or halfway between", () => {
    expect(sequenceAt([], 0)).toBe(1);
    expect(sequenceAt(rest, 0)).toBe(0);
    expect(sequenceAt(rest, 2)).toBe(3);
    expect(sequenceAt(rest, 1)).toBe(1.5);
  });

  it("returns null when the neighbours are too close", () => {
    const close = [task("a", { sequence: 1 }), task("b", { sequence: 1 + 1e-7 })];
    expect(sequenceAt(close, 1)).toBeNull();
  });
});

describe("manualOrder", () => {
  it("sorts by sequence, with a lone subtask right after its parent's place", () => {
    const tasks = [
      task("late", { sequence: 3 }),
      task("child", { parent_id: "parent", sequence: 1 }),
      task("first", { sequence: 1 }),
    ];
    const parent = task("parent", { sequence: 2 });
    const sorted = [...tasks].sort(manualOrder([...tasks, parent]));
    expect(sorted.map((item) => item.id)).toEqual(["first", "child", "late"]);
  });

  it("puts a parent before its subtasks", () => {
    const tasks = [
      task("child", { parent_id: "parent", sequence: 1 }),
      task("next", { sequence: 3 }),
      task("parent", { sequence: 2 }),
    ];
    expect([...tasks].sort(manualOrder(tasks)).map((item) => item.id)).toEqual([
      "parent",
      "child",
      "next",
    ]);
  });

  it("breaks ties by creation", () => {
    const tasks = [
      task("newer", { sequence: 2, created_at: "2026-10-02T00:00:00.000Z" }),
      task("older", { sequence: 2 }),
    ];
    expect([...tasks].sort(manualOrder(tasks)).map((item) => item.id)).toEqual([
      "older",
      "newer",
    ]);
  });
});

describe("nestTasks", () => {
  const parent = task("parent");
  const open = task("open", { parent_id: "parent", sequence: 2 });
  const done = task("done", { parent_id: "parent", completed_at: EARLIER, sequence: 1 });
  const all = [parent, open, done];

  it("a shown parent carries its subtasks in the same state, and they aren't listed twice", () => {
    const rows = nestTasks([parent, open], all, new Set(["parent"]));
    expect(rows).toEqual([{ task: parent, parent: null, subtasks: [open] }]);
  });

  it("a subtask without its parent stands alone with a breadcrumb", () => {
    expect(nestTasks([open], all, new Set())).toEqual([
      { task: open, parent, subtasks: [] },
    ]);
  });
});

describe("parseSnapshot", () => {
  const saved = (version: number, tasks: unknown[], projects: unknown[] = []) =>
    JSON.stringify({ version, tasks, projects });

  it("migrates version 1 data: snake_case keys, no recurrence, no parent, order by creation", () => {
    const data = parseSnapshot(
      saved(
        1,
        [
          {
            id: "b",
            title: "B",
            description: "",
            projectId: "work",
            dueDate: TODAY,
            priority: 2,
            completedAt: null,
            createdAt: "2026-10-02T00:00:00.000Z",
            updatedAt: "2026-10-02T00:00:00.000Z",
          },
          {
            id: "a",
            title: "A",
            description: "",
            projectId: null,
            dueDate: null,
            priority: null,
            completedAt: null,
            createdAt: EARLIER,
            updatedAt: EARLIER,
          },
        ],
        [{ id: "work", name: "Work" }],
      ),
    );
    expect(data.version).toBe(6);
    expect(data.tasks[0]).toEqual(
      task("b", {
        title: "B",
        project_id: "work",
        due_date: TODAY,
        priority: 2,
        sequence: 2,
        created_at: "2026-10-02T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      }),
    );
    expect(data.tasks[1]).toEqual(task("a", { title: "A", sequence: 1 }));
  });

  it("numbers each scope separately when adding the manual order", () => {
    // Version 4 tasks had no sequence.
    const v4 = (id: string, fields: Partial<Task> = {}) => ({
      ...task(id, fields),
      sequence: undefined,
    });
    const data = parseSnapshot(
      saved(4, [
        v4("p2", { created_at: "2026-10-03T00:00:00.000Z" }),
        v4("p1"),
        v4("c", { parent_id: "p1", created_at: "2026-10-05T00:00:00.000Z" }),
      ]),
    );
    expect(data.tasks.map(({ id, sequence }) => [id, sequence])).toEqual([
      ["p2", 2],
      ["p1", 1],
      ["c", 1],
    ]);
  });

  it("adds soft deletes to version 5 data", () => {
    const tasks = [task("a", { sequence: 7 }), task("b", { sequence: 0.5 })];
    const v5 = tasks.map((item) => ({ ...item, deleted_at: undefined }));
    expect(parseSnapshot(saved(5, v5)).tasks).toEqual(tasks);
  });

  it("keeps version 6 data as it is, tombstones included", () => {
    const tasks = [task("a", { sequence: 7 }), task("b", { deleted_at: EARLIER })];
    const now = Date.parse("2026-10-20T00:00:00.000Z");
    expect(parseSnapshot(saved(6, tasks), now).tasks).toEqual(tasks);
  });

  it("drops tombstones older than 30 days, with their subtasks", () => {
    const old = "2026-09-01T00:00:00.000Z";
    const tasks = [
      task("old", { deleted_at: old }),
      task("old-child", { parent_id: "old", deleted_at: old }),
      task("recent", { deleted_at: EARLIER }),
      task("alive"),
    ];
    const now = Date.parse("2026-10-20T00:00:00.000Z");
    expect(parseSnapshot(saved(6, tasks), now).tasks.map((item) => item.id)).toEqual([
      "recent",
      "alive",
    ]);
  });

  it.each([
    ["an unknown version", saved(99, [])],
    ["a task in an unknown project", saved(5, [task("a", { project_id: "gone" })])],
    ["duplicate tasks", saved(5, [task("a"), task("a")])],
    ["a subtask without its parent", saved(5, [task("a", { parent_id: "gone" })])],
    [
      "a subtask of a subtask",
      saved(5, [task("a"), task("b", { parent_id: "a" }), task("c", { parent_id: "b" })]),
    ],
    ["a missing sequence", saved(5, [{ ...task("a"), sequence: null }])],
    ["a bad deleted_at", saved(6, [task("a", { deleted_at: "soon" })])],
    [
      "a live subtask of a deleted task",
      saved(6, [task("a", { deleted_at: EARLIER }), task("b", { parent_id: "a" })]),
    ],
  ])("rejects %s", (_, raw) => {
    expect(() => parseSnapshot(raw)).toThrow();
  });
});
