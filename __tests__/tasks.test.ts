import { describe, expect, it } from "vitest";
import {
  byCreated,
  matchesView,
  nestTasks,
  parseSnapshot,
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

describe("byCreated", () => {
  it("sorts oldest first, breaking ties by id", () => {
    const tasks = [
      task("newer", { created_at: "2026-10-02T00:00:00.000Z" }),
      task("b"),
      task("a"),
    ];
    expect([...tasks].sort(byCreated).map((item) => item.id)).toEqual(["a", "b", "newer"]);
  });
});

describe("nestTasks", () => {
  const parent = task("parent");
  const open = task("open", { parent_id: "parent", created_at: "2026-10-02T00:00:00.000Z" });
  const done = task("done", { parent_id: "parent", completed_at: EARLIER });
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
    expect(data.version).toBe(7);
    expect(data.tasks[0]).toEqual(
      task("b", {
        title: "B",
        project_id: "work",
        due_date: TODAY,
        priority: 2,
        created_at: "2026-10-02T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      }),
    );
    expect(data.tasks[1]).toEqual(task("a", { title: "A" }));
  });

  it("adds soft deletes to version 5 data and drops its manual order", () => {
    const tasks = [task("a"), task("b")];
    const v5 = tasks.map((item, i) => ({ ...item, sequence: i + 1, deleted_at: undefined }));
    expect(parseSnapshot(saved(5, v5)).tasks).toEqual(tasks);
  });

  it("drops the manual order from version 6 data, keeping tombstones", () => {
    const tasks = [task("a"), task("b", { deleted_at: EARLIER })];
    const v6 = tasks.map((item) => ({ ...item, sequence: 0.5 }));
    const now = Date.parse("2026-10-20T00:00:00.000Z");
    expect(parseSnapshot(saved(6, v6), now).tasks).toEqual(tasks);
  });

  it("keeps version 7 data as it is", () => {
    const tasks = [task("a"), task("b", { deleted_at: EARLIER })];
    const now = Date.parse("2026-10-20T00:00:00.000Z");
    expect(parseSnapshot(saved(7, tasks), now).tasks).toEqual(tasks);
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
    ["a bad deleted_at", saved(6, [task("a", { deleted_at: "soon" })])],
    [
      "a live subtask of a deleted task",
      saved(6, [task("a", { deleted_at: EARLIER }), task("b", { parent_id: "a" })]),
    ],
  ])("rejects %s", (_, raw) => {
    expect(() => parseSnapshot(raw)).toThrow();
  });
});
