"use client";

import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Hash,
  Layers2,
  ListTodo,
  History,
  Menu,
  Pencil,
  Plus,
  SearchX,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  addDays,
  dateLabel,
  dayInSentence,
  dayLabel,
  localDate,
  childrenOf,
  manualOrder,
  matchesView,
  nestTasks,
  subtaskProgress,
  upcomingDays,
  type Project,
  type SubtaskDraft,
  type Task,
  type TaskDraft,
  type View,
} from "../lib/tasks";
import { useTasks, type ToggleUndo } from "../lib/use-tasks";
import { animateAcross, animateReorder, useDragReorder } from "../lib/use-drag-reorder";
import { matchesSearch, searchTerms } from "../lib/search";
import { TaskSearch } from "./task-search";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { ProjectFilters } from "./project-filters";
import { TaskRow } from "./task-row";
import { TaskComposer } from "./task-composer";
import { Dialog } from "./dialog";
import { TaskSection } from "./task-section";
import styles from "./task-app.module.css";
import sectionStyles from "./task-section.module.css";
import sidebarStyles from "./sidebar.module.css";

type Composer = {
  initial: TaskDraft;
  id?: string;
  completed?: boolean;
  parentTitle?: string;
  subtasks?: SubtaskDraft[];
};
const subtasks = (count: number) => `${count} ${count === 1 ? "subtask" : "subtasks"}`;

type Confirmation = { title: string; message: string; action: () => void };
// A list that can be reordered: its sortable task ids in order, its name for announcements,
// and, for a list of tasks due on one day, its drop zone: "today", "overdue" or the date.
type SortList = { ids: string[]; label?: string; zone?: string };
// The toast's Undo: puts the change back and returns the toast that confirms it.
type Undo = { run: () => string };
// Upcoming loads this many days at a time as it scrolls.
const UPCOMING_PAGE = 28;
const blankDraft = (view: View): TaskDraft => ({
  title: "",
  description: "",
  due_date: view === "upcoming" ? null : localDate(),
  project_id: null,
  priority: null,
  recurrence: null,
  parent_id: null,
});

export default function TaskApp() {
  const store = useTasks();
  const [view, setView] = useState<View>("today");
  const [today, setToday] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const reopenNavigation = useRef<HTMLButtonElement>(null);
  const desktopNavigation = useRef<HTMLElement>(null);
  const topbar = useRef<HTMLElement>(null);
  // Dragging rows scrolls the page when the pointer nears the sticky top bar.
  const drag = useDragReorder({
    topInset: () => topbar.current?.getBoundingClientRect().bottom ?? 0,
  });
  // Screen reader announcements that don't need a toast.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(""), 1000);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  useEffect(() => {
    if (!sidebarOpen) reopenNavigation.current?.focus({ preventScroll: true });
  }, [sidebarOpen]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawer = () => { if (desktop.matches) setDrawer(false); };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);
  const [composer, setComposer] = useState<Composer | null>(null);
  // The composer last opened, kept on screen while its dialog animates out; `key` gives each
  // opening a fresh form even if it reopens mid-exit.
  const [shownComposer, setShownComposer] = useState<{ composer: Composer; key: number } | null>(
    null,
  );
  if (composer && composer !== shownComposer?.composer)
    setShownComposer({ composer, key: (shownComposer?.key ?? 0) + 1 });
  const [projectEditor, setProjectEditor] = useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [notice, setNoticeText] = useState("");
  const [undo, setUndo] = useState<Undo | null>(null);
  // Rows that just appeared inside the list, for their entrance motion: the next occurrence of
  // a completed recurring task, or subtasks just added to a shown parent.
  const [enteringIds, setEnteringIds] = useState<ReadonlySet<string>>(new Set());
  // Parents whose subtask list differs from its default: open, except in History.
  const [toggledSubtasks, setToggledSubtasks] = useState<ReadonlySet<string>>(new Set());
  // Session-only search within the current view; it stays across views like the project filter.
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const terms = useMemo(() => searchTerms(deferredQuery), [deferredQuery]);
  const searching = terms.length > 0;
  const searchInput = useRef<HTMLInputElement>(null);

  // Horizontal drag of the toast, in px; `active` while a pointer is holding it.
  const [toastDrag, setToastDrag] = useState<{ x: number; active: boolean } | null>(null);
  const toastPointer = useRef<{ id: number; x: number } | null>(null);
  const toastExit = useRef<number | undefined>(undefined);

  function setNotice(message: string) {
    window.clearTimeout(toastExit.current);
    toastPointer.current = null;
    setToastDrag(null);
    setNoticeText(message);
    setUndo(null);
  }
  // Slide the toast off to the right, then clear it.
  function dismissToast() {
    setToastDrag({ x: window.innerWidth, active: false });
    toastExit.current = window.setTimeout(() => setNotice(""), 150);
  }
  const [prioritySort, setPrioritySort] = useState(false);
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [overdueExpanded, setOverdueExpanded] = useState(true);
  // How many days ahead Upcoming shows every day; scrolling near the end loads more.
  const [upcomingSpan, setUpcomingSpan] = useState(UPCOMING_PAGE);
  const upcomingSentinel = useRef<HTMLDivElement>(null);
  // Each view and project opens at the top. Kept where it was, a scroll clamped to the end of
  // a shorter page would land on Upcoming's sentinel and keep loading days.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [view, selectedProjectId]);
  // A way back to the top once the page has scrolled a screen down.
  const [scrolledDown, setScrolledDown] = useState(false);
  useEffect(() => {
    const update = () => setScrolledDown(window.scrollY > window.innerHeight);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  function backToTop() {
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: instant ? "auto" : "smooth" });
    // The button goes away at the top, so keyboard focus moves to the content.
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const sentinel = upcomingSentinel.current;
    if (!sentinel) return;
    // Runs again after each load, so it keeps loading until the end is out of reach.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setUpcomingSpan((span) => span + UPCOMING_PAGE);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [view, searching, upcomingSpan, today, store.ready]);
  const addTask = useCallback((global = false) => {
    const initial = blankDraft(view);
    if (!global) initial.project_id = selectedProjectId;
    setComposer({ initial });
    setDrawer(false);
  }, [view, selectedProjectId]);

  useEffect(() => {
    const update = () => setToday(localDate());
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    // A toast with Undo stays long enough to reach the button.
    const timer = window.setTimeout(
      () => setNotice(""),
      undo ? 8000 : 3000,
    );
    return () => window.clearTimeout(timer);
  }, [notice, undo]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        (key !== "q" && key !== "/") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        !store.ready ||
        document.querySelector("dialog[open]")
      )
        return;
      const element = event.target as HTMLElement;
      if (element.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (key === "/") {
        // No search bar on the projects grid.
        if (!searchInput.current) return;
        event.preventDefault();
        searchInput.current.focus();
        searchInput.current.select();
        return;
      }
      event.preventDefault();
      addTask(true);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [store.ready, addTask]);

  const title = {
    all: "All tasks",
    today: "Today",
    upcoming: "Upcoming",
    history: "History",
    projects: "My projects",
  }[view];
  const HeadingIcon = {
    all: ListTodo,
    today: Sun,
    upcoming: CalendarDays,
    history: History,
    projects: Layers2,
  }[view];
  const manual = manualOrder(store.tasks);
  const visibleTasks = store.tasks
    .filter(
      (task) =>
        matchesView(task, view, today, selectedProjectId) &&
        (!searching || matchesSearch(task, terms)),
    )
    .sort((a, b) =>
      view === "history"
        ? b.completed_at!.localeCompare(a.completed_at!) ||
          b.created_at.localeCompare(a.created_at)
        : prioritySort
          ? (a.priority ?? 5) - (b.priority ?? 5) || manual(a, b)
          : manual(a, b),
    );
  // Why the shown order can't change right now, if it can't.
  const reorderBlock =
    view === "history"
      ? "History is ordered by completion date."
      : prioritySort
        ? "Turn off Sort by priority to reorder tasks."
        : searching
          ? "Clear the search to reorder tasks."
          : null;
  // Parents shown anywhere in the view carry their subtasks; see nestTasks.
  const shownParents = new Set(
    visibleTasks.filter((task) => task.parent_id === null).map((task) => task.id),
  );
  const shownRows = nestTasks(visibleTasks, store.tasks, shownParents).reduce(
    (count, entry) => count + 1 + entry.subtasks.length,
    0,
  );
  const overdueTasks = visibleTasks.filter(
    (task) => task.due_date && task.due_date < today,
  );
  const overdueCount = overdueTasks.length;
  // The progress card ignores the search.
  const overdueInView = searching
    ? store.tasks.filter(
        (task) =>
          matchesView(task, view, today, selectedProjectId) &&
          task.due_date &&
          task.due_date < today,
      ).length
    : overdueCount;
  const dueTodayTasks = visibleTasks.filter((task) => task.due_date === today);
  // Upcoming's tasks by day, and its days: every day through the loaded span, or only days
  // with matches while searching.
  const tasksByDate = new Map<string, Task[]>();
  for (const task of visibleTasks)
    if (task.due_date) tasksByDate.set(task.due_date, [...(tasksByDate.get(task.due_date) ?? []), task]);
  const upcomingEnd = today && addDays(today, upcomingSpan);
  const shownDays =
    view !== "upcoming" || !today
      ? []
      : searching
        ? [...tasksByDate.keys()].sort()
        : upcomingDays(today, upcomingEnd, tasksByDate.keys());
  // The tasks in a drop zone, and the date a task dropped there becomes due.
  const zoneTasks = (zone: string) =>
    zone === "today"
      ? dueTodayTasks
      : zone === "overdue"
        ? overdueTasks
        : (tasksByDate.get(zone) ?? []);
  const zoneDate = (zone: string) => (zone === "today" ? today : zone);
  // The zone a move one place past the end of a list goes to. Overdue only gives tasks away,
  // to Today above it; Upcoming's days run on from tomorrow.
  function neighbourZone(zone: string, step: -1 | 1) {
    if (zone === "today") return null;
    if (zone === "overdue") return step < 0 ? "today" : null;
    const next = addDays(zone, step);
    return next > today ? next : null;
  }
  const todayTasks = store.tasks.filter(
    (task) =>
      task.due_date === today &&
      (selectedProjectId === null || task.project_id === selectedProjectId),
  );
  const todayCompleted = todayTasks.filter((task) => task.completed_at).length;
  const progress = todayTasks.length
    ? Math.round((todayCompleted / todayTasks.length) * 100)
    : 0;
  const dateHeading = today
    ? new Date(`${today}T12:00:00`).toLocaleDateString("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";

  function navigate(next: View) {
    setView(next);
    setDrawer(false);
    setComposer(null);
    setPrioritySort(false);
    setUpcomingSpan(UPCOMING_PAGE);
  }
  function selectProject(id: string | null) {
    setSelectedProjectId(id);
    setDrawer(false);
    setComposer(null);
    if (view === "projects") setView("all");
  }
  function editTask(task: Task) {
    setComposer({
      initial: {
        title: task.title,
        description: task.description,
        project_id: task.project_id,
        due_date: task.due_date,
        priority: task.priority,
        recurrence: task.recurrence,
        parent_id: task.parent_id,
      },
      id: task.id,
      completed: !!task.completed_at,
      parentTitle: store.tasks.find((item) => item.id === task.parent_id)?.title,
      subtasks:
        task.parent_id === null
          ? childrenOf(store.tasks, task.id).map((child) => ({
              id: child.id,
              title: child.title,
              description: child.description,
              done: !!child.completed_at,
            }))
          : undefined,
    });
  }
  function addSubtask(parent: Task) {
    setComposer({
      initial: {
        ...blankDraft(view),
        due_date: null,
        project_id: parent.project_id,
        parent_id: parent.id,
      },
      parentTitle: parent.title,
    });
    // Show the list the new subtask lands in.
    setToggledSubtasks((current) => {
      const next = new Set(current);
      next.delete(parent.id);
      return next;
    });
  }
  function changeQuery(next: string) {
    // Starting or clearing a search resets subtask lists to their defaults, and a new
    // search opens Today's sections so matches aren't hidden.
    if (!!query.trim() !== !!next.trim()) {
      setToggledSubtasks(new Set());
      if (next.trim()) {
        setTodayExpanded(true);
        setOverdueExpanded(true);
      }
    }
    setQuery(next);
  }
  function toggleSubtasks(id: string) {
    setToggledSubtasks((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  function saveTask(draft: TaskDraft, subtaskLines?: SubtaskDraft[]) {
    // Ignore a repeat submit while the composer animates out.
    if (!composer) return;
    const editing = !!composer?.id;
    const saved = store.saveTask(draft, composer?.id, subtaskLines);
    const projectName = store.projects.find((project) => project.id === draft.project_id)?.name;
    if (!editing && draft.parent_id) setEnteringIds(new Set([saved.id]));
    if (editing && saved.added.length) {
      setEnteringIds(new Set(saved.added));
      // Show the list the new subtasks land in.
      setToggledSubtasks((current) => {
        const next = new Set(current);
        next.delete(saved.id);
        return next;
      });
    }
    const hidden =
      searching && !draft.parent_id && view !== "history" && !matchesSearch(draft, terms);
    // "2 subtasks added, 1 completed, 1 deleted"
    const changes = (
      [
        [saved.added.length, "added"],
        [saved.completed, "completed"],
        [saved.reopened, "reopened"],
        [saved.removed, "deleted"],
      ] as const
    )
      .filter(([count]) => count)
      .map(([count, verb], index) => (index ? `${count} ${verb}` : `${subtasks(count)} ${verb}`))
      .join(", ");
    const sentences = draft.parent_id
      ? [editing ? "Subtask updated" : "Subtask added"]
      : editing
        ? [
            "Task updated",
            changes,
            saved.moved &&
              `Its ${subtasks(saved.moved)} ${projectName ? `moved to ${projectName}` : "moved too"}`,
            hidden && "Clear search to see it",
          ]
        : [
            `${draft.recurrence ? "Repeating task" : "Task"}${saved.added.length ? ` and ${subtasks(saved.added.length)}` : ""} added`,
            view === "history"
              ? `Find ${saved.added.length ? "them" : "it"} in All`
              : hidden && "Clear search to see it",
          ];
    const parts = sentences.filter(Boolean);
    setNotice(parts.length > 1 ? `${parts.join(". ")}.` : parts[0] || "");
    setComposer(null);
  }
  function toggleTask(task: Task) {
    const row = document.activeElement?.closest("[data-task-id]");
    const undo = store.toggleTask(task.id);
    if (!undo) return;
    // Keep keyboard focus in the list: the next occurrence or this row if still shown, then
    // for a subtask its next or previous sibling or its parent, otherwise the next row
    // outside this one.
    if (row?.getAttribute("data-task-id") === task.id) {
      const rows = [...document.querySelectorAll("[data-task-id]")];
      const after = rows.slice(rows.indexOf(row) + 1).find((item) => !row.contains(item));
      const ids = [
        undo.spawned?.id,
        task.id,
        ...(task.parent_id
          ? [
              row.nextElementSibling?.getAttribute("data-task-id"),
              row.previousElementSibling?.getAttribute("data-task-id"),
              task.parent_id,
            ]
          : [after?.getAttribute("data-task-id")]),
      ];
      // After React commits the toggle.
      window.requestAnimationFrame(() => {
        const target = ids
          .map((id) => (id ? document.querySelector(`[data-task-id="${CSS.escape(id)}"]`) : null))
          .find(Boolean);
        (target?.querySelector("button") ?? document.getElementById("main-content"))?.focus();
      });
    }
    setEnteringIds(new Set(undo.spawned ? [undo.spawned.id] : []));
    setNotice(toggleNotice(task, undo));
    setUndo({
      run: () => {
        store.undoToggle(undo);
        return undo.previous.find((item) => item.id === undo.id)?.completed_at
          ? "Restore undone"
          : "Completion undone";
      },
    });
  }
  function toggleNotice(task: Task, undo: ToggleUndo) {
    const next = undo.spawned ? ` Next due ${dayInSentence(undo.spawned.dueDate)}.` : "";
    if (task.completed_at) {
      if (undo.reopenedParent) return "Subtask and its parent restored";
      if (task.parent_id) return "Subtask restored to incomplete";
      if (task.recurrence)
        return undo.cascaded
          ? `Restored as a one-off task with ${subtasks(undo.cascaded)}`
          : "Restored as a one-off task";
      return undo.cascaded
        ? `Task and ${subtasks(undo.cascaded)} restored`
        : "Task restored to incomplete";
    }
    if (task.parent_id) {
      const { done, total } = subtaskProgress(store.tasks, task.parent_id);
      return done + 1 === total
        ? `Subtask completed. All ${total} done.`
        : `Subtask completed. ${done + 1} of ${total} done.`;
    }
    if (undo.cascaded) return `Task and ${subtasks(undo.cascaded)} completed.${next}`;
    return next ? `Task completed.${next}` : "Task completed. A little progress.";
  }
  function deleteTask(task: Task) {
    const repeating = task.recurrence && !task.completed_at;
    const children = store.tasks.filter((item) => item.parent_id === task.id).length;
    const its = children === 1 ? "its subtask" : `its ${children} subtasks`;
    setConfirmation({
      title: task.parent_id
        ? "Delete subtask?"
        : children
          ? "Delete task and subtasks?"
          : repeating
            ? "Delete repeating task?"
            : "Delete task?",
      message: children
        ? repeating
          ? `“${task.title}” and ${its} will be deleted, and the task will stop repeating. Past completions stay in History.`
          : `“${task.title}” and ${its} will be permanently deleted.`
        : repeating
          ? `“${task.title}” will be deleted and stop repeating. Past completions stay in History.`
          : `“${task.title}” will be permanently deleted.`,
      action: () => {
        store.deleteTask(task.id);
        setNotice(
          task.parent_id
            ? "Subtask deleted"
            : children
              ? `Task and ${subtasks(children)} deleted`
              : "Task deleted",
        );
      },
    });
  }
  function deleteProject(project: Project) {
    setConfirmation({
      title: "Delete project?",
      message: `Delete “${project.name}”? Its tasks will be kept without a project.`,
      action: () => {
        store.deleteProject(project.id);
        if (selectedProjectId === project.id) setSelectedProjectId(null);
        setNotice("Project deleted. Its tasks are now unassigned.");
      },
    });
  }
  function announceMove(
    task: Task,
    moved: { position: number; total: number } | null,
    list: SortList,
  ) {
    if (moved)
      setAnnouncement(
        `Moved “${task.title}” to position ${moved.position} of ${moved.total}${list.label ? ` in ${list.label}` : ""}.`,
      );
  }
  // The sortable ids a zone's list shows, in order.
  const zoneIds = (zone: string) =>
    nestTasks(zoneTasks(zone), store.tasks, shownParents)
      .filter((entry) => entry.task.parent_id === null)
      .map((entry) => entry.task.id);
  // Moves a task into another day's list. `order` is that list's ids with the task in its
  // new place; a list that isn't shown, like a collapsed section, takes it at the end.
  function reschedule(task: Task, zone: string, order: string[]) {
    const date = zoneDate(zone);
    const ids = order.some((id) => id !== task.id) ? order : [...zoneIds(zone), task.id];
    const moved = store.rescheduleTask(task.id, date, ids);
    if (!moved) return;
    setNotice(`Moved to ${dayInSentence(date)}`);
    setUndo({
      run: () => {
        store.undoReschedule(moved);
        return "Move undone";
      },
    });
  }
  // One place up or down, from the keyboard shortcut or the row menu. Past either end of a
  // day's list, the task moves into the neighbouring day's.
  function moveTask(task: Task, step: -1 | 1, from: "key" | "menu", list: SortList) {
    const index = list.ids.indexOf(task.id);
    if (reorderBlock || index < 0) {
      setNotice(reorderBlock ?? "Reorder this subtask from its parent task.");
      return;
    }
    const target = index + step;
    const next = list.zone && neighbourZone(list.zone, step);
    if ((target < 0 || target >= list.ids.length) && next) {
      moveAcross(task, next, step, from);
      return;
    }
    if (target < 0 || target >= list.ids.length) {
      setAnnouncement(`“${task.title}” is already ${step < 0 ? "first" : "last"}.`);
      return;
    }
    const order = list.ids.filter((id) => id !== task.id);
    order.splice(target, 0, task.id);
    const row = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`);
    const focused = document.activeElement;
    let moved: { position: number; total: number } | null = null;
    animateReorder(row?.parentElement, () =>
      flushSync(() => {
        moved = store.moveTask(task.id, order);
      }),
    );
    announceMove(task, moved, list);
    // Moving the row can drop focus; keep it where it was, or on the menu to move again.
    const control = from === "menu" ? row?.querySelector("summary") : focused;
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  }
  // Moves a task to the near end of the neighbouring day's list: the top when moving down,
  // the bottom when moving up.
  function moveAcross(task: Task, zone: string, step: -1 | 1, from: "key" | "menu") {
    const selector = `[data-task-id="${CSS.escape(task.id)}"]`;
    const row = document.querySelector<HTMLElement>(selector);
    const group = row?.closest("[data-sort-group]");
    if (!row || !group) return;
    // The row remounts in its new list, so find the focused control again by its place.
    const controls = (element: Element) => [...element.querySelectorAll("button, summary")];
    const focusedAt = controls(row).indexOf(document.activeElement as Element);
    const ids = zoneIds(zone).filter((id) => id !== task.id);
    animateAcross(group, () =>
      flushSync(() => reschedule(task, zone, step > 0 ? [task.id, ...ids] : [...ids, task.id])),
    );
    const moved = document.querySelector<HTMLElement>(selector);
    const control =
      from === "menu" ? moved?.querySelector("summary") : moved && controls(moved)[focusedAt];
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
    moved?.scrollIntoView({ block: "nearest" });
  }
  function renderRow(
    task: Task,
    parent: Task | null,
    children: Task[],
    nested: boolean,
    list: SortList,
  ) {
    // Open by default, except in History; a search also opens lists with matching subtasks.
    const expanded =
      (!task.completed_at || (searching && children.some((child) => matchesSearch(child, terms)))) !==
      toggledSubtasks.has(task.id);
    const index = list.ids.indexOf(task.id);
    const childList = { ids: children.map((child) => child.id), label: `“${task.title}”` };
    // The days a move past either end of this row's list goes to.
    const above = list.zone ? neighbourZone(list.zone, -1) : null;
    const below = list.zone ? neighbourZone(list.zone, 1) : null;
    return (
      <TaskRow
        key={task.id}
        task={task}
        project={store.projects.find((project) => project.id === task.project_id)}
        parent={parent}
        subtask={nested}
        terms={searching ? terms : undefined}
        progress={task.parent_id ? undefined : subtaskProgress(store.tasks, task.id)}
        subtasks={
          children.length
            ? {
                expanded,
                onToggle: () => toggleSubtasks(task.id),
                children: children.map((child) => renderRow(child, task, [], true, childList)),
              }
            : undefined
        }
        rolledOver={enteringIds.has(task.id)}
        onRolledOver={() =>
          setEnteringIds((current) => {
            const next = new Set(current);
            next.delete(task.id);
            return next;
          })
        }
        onToggle={() => toggleTask(task)}
        onEdit={() => editTask(task)}
        onDelete={() => deleteTask(task)}
        onAddSubtask={
          task.parent_id === null && !task.completed_at ? () => addSubtask(task) : undefined
        }
        reorder={
          !reorderBlock && index >= 0 && (list.ids.length > 1 || (list.zone && list.zone !== "today"))
            ? {
                onGripDown: (event) =>
                  drag.start(event, (order, zone) =>
                    zone !== null && zone !== list.zone
                      ? reschedule(task, zone, order)
                      : announceMove(task, store.moveTask(task.id, order), list),
                  ),
                canMoveUp: index > 0 || !!above,
                canMoveDown: index < list.ids.length - 1 || !!below,
                moveUpLabel:
                  index === 0 && above ? `Move to ${dayLabel(zoneDate(above))}` : undefined,
                moveDownLabel:
                  index === list.ids.length - 1 && below
                    ? `Move to ${dayLabel(zoneDate(below))}`
                    : undefined,
              }
            : undefined
        }
        onMove={(step, from) => moveTask(task, step, from, list)}
      />
    );
  }
  // `label` names the list in announcements, such as a section or a date, and `zone` is the
  // drop zone of a list of tasks due on one day.
  function renderTasks(tasks: Task[], label?: string, zone?: string) {
    const entries = nestTasks(tasks, store.tasks, shownParents);
    // Subtasks shown on their own are ordered from their parent, not here.
    const list = {
      ids: entries.filter((entry) => entry.task.parent_id === null).map((entry) => entry.task.id),
      label,
      zone,
    };
    return (
      <ul className={sectionStyles["task-list"]} data-sort-list={zone === undefined ? undefined : ""}>
        {entries.map((entry) => renderRow(entry.task, entry.parent, entry.subtasks, false, list))}
      </ul>
    );
  }
  const sidebarProps = {
    projectsExpanded,
    onToggleProjects: () => setProjectsExpanded((expanded) => !expanded),
    view,
    navigate,
    tasks: store.tasks,
    projects: store.projects,
    today,
    selectedProjectId,
    onSelectProject: selectProject,
    onAddTask: () => addTask(true),
    onAddProject: () => {
      setDrawer(false);
      setProjectEditor({ name: "" });
    },
  };

  return (
    <div
      className={`${styles["app-shell"]} ${sidebarOpen ? "" : styles["sidebar-collapsed"]} ${drag.dragging ? styles["is-dragging"] : ""}`}
    >
      <a href="#main-content" className="skip-link">
        Skip to tasks
      </a>
      <aside
        ref={desktopNavigation}
        id="desktop-navigation"
        className={styles["desktop-sidebar"]}
        inert={!sidebarOpen}
        aria-hidden={!sidebarOpen}
      >
        <Sidebar {...sidebarProps} onCollapse={() => setSidebarOpen(false)} />
      </aside>
      <div className={styles["main-shell"]}>
        <header ref={topbar} className={styles.topbar}>
          <div className={styles.breadcrumb}>
            {!sidebarOpen && (
              <button
                ref={reopenNavigation}
                type="button"
                className={`icon-button ${styles["desktop-reopen"]}`}
                aria-label="Expand navigation"
                aria-controls="desktop-navigation"
                aria-expanded={false}
                onClick={() => {
                  setSidebarOpen(true);
                  window.requestAnimationFrame(() => {
                    desktopNavigation.current
                      ?.querySelector<HTMLButtonElement>("button")
                      ?.focus({ preventScroll: true });
                  });
                }}
              >
                <Menu size={20} />
              </button>
            )}
            <button
              className={`icon-button ${styles["mobile-menu"]}`}
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={20} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={13} />
            <span className={styles["breadcrumb-current"]}>{title}</span>
          </div>
          <div className={styles["header-actions"]}>
            <span className={styles["topbar-right"]}>
              <span className={styles["status-dot"]} />
              Personal workspace
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className={styles["main-content"]} tabIndex={-1}>
          {store.storageError && (
            <div role="alert" className={styles["storage-error"]}>
              {store.storageError}
            </div>
          )}
          {!store.ready || !today ? (
            <div className="loading-state" role="status">
              <div className={`${styles.skeleton} ${styles["skeleton-title"]}`} />
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <span className="sr-only">Loading your tasks</span>
            </div>
          ) : (
            <>
              <div className={styles["page-eyebrow"]}>
                {view === "today"
                  ? dateHeading
                  : view === "all"
                    ? "Everything you want to move forward"
                    : view === "upcoming"
                      ? "Make a little space for what’s next"
                      : view === "history"
                        ? "A little progress, remembered"
                        : "Your ideas, a little more organized"}
              </div>
              <div className={styles["page-heading"]}>
                <h1>
                  {title}
                  <span
                    className={`${styles["heading-icon"]} ${view === "today" ? styles["heading-icon-today"] : ""}`}
                    aria-hidden="true"
                  >
                    <HeadingIcon size={27} strokeWidth={1.5} />
                  </span>
                </h1>
                <div className={styles["heading-actions"]}>
                  {view !== "history" && (
                    <button
                      className={`button primary ${styles["desktop-add"]}`}
                      onClick={() =>
                        view === "projects"
                          ? setProjectEditor({ name: "" })
                          : addTask()
                      }
                    >
                      <Plus size={16} />
                      {view === "projects" ? "New project" : "Add task"}
                    </button>
                  )}
                </div>
              </div>
              <p className={styles["page-subtitle"]}>
                {view === "today"
                  ? "A fresh start. Let’s make it a good one."
                  : view === "all"
                    ? "Your tasks, together in one place."
                    : view === "upcoming"
                      ? "A little planning goes a long way."
                      : view === "history"
                        ? "A record of what you’ve accomplished. Restore anything you want to revisit."
                        : view === "projects"
                          ? "Give the things that matter a space of their own."
                          : "Small steps, meaningful progress."}
              </p>
              {view === "today" && (
                <div className={styles["daily-progress"]}>
                  <div className={styles["progress-icon"]}>
                    <CircleCheck size={20} strokeWidth={1.5} />
                  </div>
                  <div className={styles["progress-copy"]}>
                    <span>Due today</span>
                    <span>
                      {todayTasks.length === 0
                        ? "No tasks due today"
                        : `${todayCompleted} of ${todayTasks.length} completed`}
                      {overdueInView > 0 && ` · ${overdueInView} overdue below`}
                    </span>
                  </div>
                  <div
                    className={styles["progress-track"]}
                    role="progressbar"
                    aria-label="Today's completion"
                    aria-valuetext={`${todayCompleted} of ${todayTasks.length} tasks due today completed; overdue tasks excluded`}
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <span className={styles["progress-number"]}>{progress}%</span>
                </div>
              )}
              {view === "projects" ? (
                <div className={styles["project-list"]}>
                  {store.projects.map((project, index) => (
                    <div className={styles["project-card"]} key={project.id}>
                      <button
                        className={styles["project-card-main"]}
                        onClick={() => {
                          selectProject(project.id);
                          setView("all");
                        }}
                      >
                        <span
                          className={`${styles["project-icon"]} ${sidebarStyles[`project-tone-${index % 3}`]}`}
                        >
                          <Hash size={20} />
                        </span>
                        <span>
                          <strong>{project.name}</strong>
                          <small>
                            {
                              store.tasks.filter(
                                (task) =>
                                  task.project_id === project.id &&
                                  !task.completed_at,
                              ).length
                            }{" "}
                            active tasks
                          </small>
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                      <div className={styles["project-card-actions"]}>
                        <button
                          className="icon-button"
                          aria-label={`Rename ${project.name}`}
                          onClick={() => setProjectEditor(project)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${project.name}`}
                          onClick={() => deleteProject(project)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <TaskSearch
                    ref={searchInput}
                    value={query}
                    onChange={changeQuery}
                    scope={title}
                    resultCount={searching ? visibleTasks.length : null}
                  />
                  <ProjectFilters
                    projects={store.projects}
                    selectedProjectId={selectedProjectId}
                    onSelect={selectProject}
                  />
                  <div className={styles["list-toolbar"]}>
                    {searching ? (
                      <span>
                        {visibleTasks.length}{" "}
                        {visibleTasks.length === 1 ? "result" : "results"} in {title}
                      </span>
                    ) : (
                      <span>
                        {shownRows} {shownRows === 1 ? "task" : "tasks"}
                        <span className={styles["toolbar-dot"]}>·</span>
                        {view === "today"
                          ? "You’ve got this"
                          : "One thing at a time"}
                      </span>
                    )}
                    {view === "history" ? (
                      <span>Newest completed first</span>
                    ) : (
                      <button
                        className={`${styles["sort-button"]} ${prioritySort ? styles["sort-active"] : ""}`}
                        aria-pressed={prioritySort}
                        onClick={() => setPrioritySort((value) => !value)}
                      >
                        <ArrowDown size={13} />
                        {prioritySort ? "Priority" : "Sort by priority"}
                      </button>
                    )}
                  </div>
                  {view === "today" ? (
                    // Overdue tasks can be dragged up into Today to make them due today.
                    <div data-sort-group>
                      {(!searching || dueTodayTasks.length > 0) && (
                        <TaskSection
                          title="Today"
                          tasks={dueTodayTasks}
                          expanded={todayExpanded}
                          onToggle={() => setTodayExpanded((value) => !value)}
                          date={new Date(`${today}T12:00:00`).toLocaleDateString("en", {
                            month: "short", day: "numeric",
                          })}
                          zone="today"
                        >
                          {renderTasks(dueTodayTasks, "Today", "today")}
                        </TaskSection>
                      )}
                      {overdueCount > 0 && (
                        <TaskSection
                          title="Overdue"
                          tasks={overdueTasks}
                          expanded={overdueExpanded}
                          onToggle={() => setOverdueExpanded((value) => !value)}
                          overdue
                          zone="overdue"
                          sourceOnly
                        >
                          {renderTasks(overdueTasks, "Overdue", "overdue")}
                        </TaskSection>
                      )}
                    </div>
                  ) : view === "upcoming" ? (
                    // Every day is a drop zone: dragging a task to a day makes it due then.
                    <div className={sectionStyles["day-list"]} data-sort-group>
                      {shownDays.map((date, i) => {
                        const tasks = tasksByDate.get(date) ?? [];
                        const month = date.slice(0, 7);
                        return (
                          <Fragment key={date}>
                            {month !== shownDays[i - 1]?.slice(0, 7) && (
                              <h2 className={sectionStyles["month-heading"]}>
                                {new Date(`${date}T12:00:00`).toLocaleDateString("en", {
                                  month: "long",
                                  year: month.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
                                })}
                              </h2>
                            )}
                            <section
                              className={`${sectionStyles["day-section"]} ${tasks.length ? "" : sectionStyles["empty-day"]}`}
                              data-sort-zone={date}
                              data-sort-label={dayLabel(date)}
                            >
                              <h3 className={sectionStyles["section-heading"]}>
                                {dateLabel(date)}
                                {tasks.length > 0 && <span>{tasks.length}</span>}
                                <span className={sectionStyles["section-date"]}>
                                  {new Date(`${date}T12:00:00`).toLocaleDateString("en", {
                                    weekday: "long",
                                  })}
                                </span>
                              </h3>
                              {tasks.length > 0 && renderTasks(tasks, dateLabel(date), date)}
                            </section>
                            {date === upcomingEnd && !searching && (
                              <div ref={upcomingSentinel} aria-hidden="true" />
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    renderTasks(visibleTasks)
                  )}
                  {searching && visibleTasks.length === 0 && (
                    <div className={styles["empty-state"]}>
                      <span>
                        <SearchX size={27} />
                      </span>
                      <h2>No matching tasks</h2>
                      <p>
                        {selectedProjectId
                          ? `Nothing in ${title} for ${store.projects.find((project) => project.id === selectedProjectId)?.name} matches “${deferredQuery.trim()}”. Try All projects or fewer words.`
                          : `Nothing in ${title} matches “${deferredQuery.trim()}”. Try fewer or different words.`}
                      </p>
                      <div className={styles["empty-actions"]}>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            changeQuery("");
                            searchInput.current?.focus();
                          }}
                        >
                          Clear search
                        </button>
                        {(view === "today" || view === "upcoming") && (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => {
                              navigate("all");
                              searchInput.current?.focus();
                            }}
                          >
                            Search All tasks
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {!searching && visibleTasks.length === 0 && view !== "today" && view !== "upcoming" && (
                    <div className={styles["empty-state"]}>
                      <span>
                        {view === "history" ? (
                          <History size={27} />
                        ) : view === "all" ? (
                          <ListTodo size={27} />
                        ) : (
                          <CalendarDays size={27} />
                        )}
                      </span>
                      <h2>
                        {view === "history"
                          ? "Your progress starts here"
                          : "A fresh page"}
                      </h2>
                      <p>
                        {view === "history"
                          ? "Completed tasks will appear here. Restore one whenever you need to revisit it."
                          : selectedProjectId
                            ? "No tasks match this view for this project. Choose All projects to see more."
                            : "Add a task and take the first small step."}
                      </p>
                    </div>
                  )}
                </>
              )}
              <footer className={styles["content-footer"]}>
                <span className={styles["footer-line"]} />
                <span className={styles["footer-line"]} />
              </footer>
            </>
          )}
        </main>
        {scrolledDown && (
          <button
            type="button"
            className={`icon-button ${styles["back-to-top"]}`}
            aria-label="Back to top"
            title="Back to top"
            onClick={backToTop}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        )}
        {store.ready && view !== "history" && (
          <button
            className={styles["mobile-fab"]}
            aria-label={view === "projects" ? "New project" : "Add task"}
            onClick={() =>
              view === "projects" ? setProjectEditor({ name: "" }) : addTask()
            }
          >
            <Plus size={24} />
          </button>
        )}
      </div>
      <Dialog
        open={drawer}
        title="Your workspace"
        variant="navigation"
        onClose={() => setDrawer(false)}
      >
        <Sidebar {...sidebarProps} onClose={() => setDrawer(false)} />
      </Dialog>
      {shownComposer && (
        <Dialog
          open={!!composer}
          title={
            shownComposer.composer.initial.parent_id
              ? shownComposer.composer.id
                ? "Edit subtask"
                : "Add subtask"
              : shownComposer.composer.id
                ? "Edit task"
                : "Add task"
          }
          onClose={() => setComposer(null)}
          onClosed={() => setShownComposer(null)}
        >
          <TaskComposer
            key={shownComposer.key}
            initial={shownComposer.composer.initial}
            projects={store.projects}
            editing={!!shownComposer.composer.id}
            completed={shownComposer.composer.completed}
            parentTitle={shownComposer.composer.parentTitle}
            subtasks={shownComposer.composer.subtasks}
            onSave={saveTask}
            onCancel={() => setComposer(null)}
          />
        </Dialog>
      )}
      {projectEditor && (
        <Dialog
          title={projectEditor.id ? "Rename project" : "New project"}
          onClose={() => setProjectEditor(null)}
        >
          <form
            className={styles["project-form"]}
            onSubmit={(event) => {
              event.preventDefault();
              if (!projectEditor.name.trim()) return;
              const id = store.saveProject(
                projectEditor.name.trim(),
                projectEditor.id,
              );
              setProjectEditor(null);
              if (!projectEditor.id) setSelectedProjectId(id);
              setNotice(
                projectEditor.id ? "Project renamed" : "Project created",
              );
            }}
          >
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              data-initial-focus
              autoFocus
              required
              maxLength={80}
              placeholder="Something worth working on"
              value={projectEditor.name}
              onChange={(event) =>
                setProjectEditor({ ...projectEditor, name: event.target.value })
              }
            />
            <p>Keep related tasks together in one simple space.</p>
            <div className={styles["dialog-actions"]}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setProjectEditor(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!projectEditor.name.trim()}
              >
                {projectEditor.id ? "Save changes" : "Create project"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          onClose={() => setConfirmation(null)}
        >
          <div className={styles["confirmation-body"]}>
            <p>{confirmation.message}</p>
            <div className={styles["dialog-actions"]}>
              <button
                className="button secondary"
                data-initial-focus
                autoFocus
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="button destructive"
                onClick={() => {
                  confirmation.action();
                  setConfirmation(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {notice && (
        <div
          className={`${styles.toast} ${toastDrag?.active ? styles["toast-dragging"] : ""}`}
          style={
            toastDrag
              ? ({
                  "--swipe-x": `${toastDrag.x}px`,
                  opacity: Math.max(0, 1 - toastDrag.x / 300),
                } as React.CSSProperties)
              : undefined
          }
          role="status"
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
            toastPointer.current = { id: event.pointerId, x: event.clientX };
            event.currentTarget.setPointerCapture(event.pointerId);
            setToastDrag({ x: 0, active: true });
          }}
          onPointerMove={(event) => {
            const start = toastPointer.current;
            if (start?.id !== event.pointerId) return;
            setToastDrag({ x: Math.max(0, event.clientX - start.x), active: true });
          }}
          onPointerUp={(event) => {
            const start = toastPointer.current;
            if (start?.id !== event.pointerId) return;
            toastPointer.current = null;
            if (event.clientX - start.x > 80) dismissToast();
            else setToastDrag(null);
          }}
          onPointerCancel={() => {
            toastPointer.current = null;
            setToastDrag(null);
          }}
        >
          <CircleCheck size={17} />
          <span className={styles["toast-message"]}>{notice}</span>
          {undo && (
            <button
              className={styles["toast-undo"]}
              onClick={() => setNotice(undo.run())}
            >
              Undo
            </button>
          )}
          <button
            className={`icon-button ${styles["toast-close"]}`}
            aria-label="Dismiss notification"
            onClick={dismissToast}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
