"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
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
} from "lucide-react";
import {
  dateLabel,
  dayInSentence,
  localDate,
  childrenOf,
  matchesView,
  nestTasks,
  subtaskProgress,
  type Project,
  type SubtaskDraft,
  type Task,
  type TaskDraft,
  type View,
} from "../lib/tasks";
import { useTasks, type ToggleUndo } from "../lib/use-tasks";
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
const blankDraft = (view: View): TaskDraft => ({
  title: "",
  description: "",
  dueDate: view === "upcoming" ? null : localDate(),
  projectId: null,
  priority: null,
  recurrence: null,
  parentId: null,
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
  const [projectEditor, setProjectEditor] = useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [notice, setNoticeText] = useState("");
  const [undoCompletion, setUndoCompletion] = useState<ToggleUndo | null>(null);
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

  function setNotice(message: string) {
    setNoticeText(message);
    setUndoCompletion(null);
  }
  const [prioritySort, setPrioritySort] = useState(false);
  const [todayExpanded, setTodayExpanded] = useState(true);
  const [overdueExpanded, setOverdueExpanded] = useState(true);
  const addTask = useCallback((global = false) => {
    const initial = blankDraft(view);
    if (!global) initial.projectId = selectedProjectId;
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
    const timer = window.setTimeout(
      () => setNotice(""),
      undoCompletion ? 8000 : 3500,
    );
    return () => window.clearTimeout(timer);
  }, [notice, undoCompletion]);
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
  const visibleTasks = store.tasks
    .filter(
      (task) =>
        matchesView(task, view, today, selectedProjectId) &&
        (!searching || matchesSearch(task, terms)),
    )
    .sort((a, b) =>
      view === "history"
        ? b.completedAt!.localeCompare(a.completedAt!) ||
          b.createdAt.localeCompare(a.createdAt)
        : prioritySort
          ? (a.priority ?? 5) - (b.priority ?? 5) ||
            a.createdAt.localeCompare(b.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
    );
  // Parents shown anywhere in the view carry their subtasks; see nestTasks.
  const shownParents = new Set(
    visibleTasks.filter((task) => task.parentId === null).map((task) => task.id),
  );
  const shownRows = nestTasks(visibleTasks, store.tasks, shownParents).reduce(
    (count, entry) => count + 1 + entry.subtasks.length,
    0,
  );
  const overdueTasks = visibleTasks.filter(
    (task) => task.dueDate && task.dueDate < today,
  );
  const overdueCount = overdueTasks.length;
  // The progress card ignores the search.
  const overdueInView = searching
    ? store.tasks.filter(
        (task) =>
          matchesView(task, view, today, selectedProjectId) &&
          task.dueDate &&
          task.dueDate < today,
      ).length
    : overdueCount;
  const dueTodayTasks = visibleTasks.filter((task) => task.dueDate === today);
  const todayTasks = store.tasks.filter(
    (task) =>
      task.dueDate === today &&
      (selectedProjectId === null || task.projectId === selectedProjectId),
  );
  const todayCompleted = todayTasks.filter((task) => task.completedAt).length;
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
        projectId: task.projectId,
        dueDate: task.dueDate,
        priority: task.priority,
        recurrence: task.recurrence,
        parentId: task.parentId,
      },
      id: task.id,
      completed: !!task.completedAt,
      parentTitle: store.tasks.find((item) => item.id === task.parentId)?.title,
      subtasks:
        task.parentId === null
          ? childrenOf(store.tasks, task.id).map((child) => ({
              id: child.id,
              title: child.title,
              done: !!child.completedAt,
            }))
          : undefined,
    });
  }
  function addSubtask(parent: Task) {
    setComposer({
      initial: {
        ...blankDraft(view),
        dueDate: null,
        projectId: parent.projectId,
        parentId: parent.id,
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
    const editing = !!composer?.id;
    const saved = store.saveTask(draft, composer?.id, subtaskLines);
    const projectName = store.projects.find((project) => project.id === draft.projectId)?.name;
    if (!editing && draft.parentId) setEnteringIds(new Set([saved.id]));
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
      searching && !draft.parentId && view !== "history" && !matchesSearch(draft, terms);
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
    const sentences = draft.parentId
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
        ...(task.parentId
          ? [
              row.nextElementSibling?.getAttribute("data-task-id"),
              row.previousElementSibling?.getAttribute("data-task-id"),
              task.parentId,
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
    setUndoCompletion(undo);
  }
  function toggleNotice(task: Task, undo: ToggleUndo) {
    const next = undo.spawned ? ` Next due ${dayInSentence(undo.spawned.dueDate)}.` : "";
    if (task.completedAt) {
      if (undo.reopenedParent) return "Subtask and its parent restored";
      if (task.parentId) return "Subtask restored to incomplete";
      if (task.recurrence)
        return undo.cascaded
          ? `Restored as a one-off task with ${subtasks(undo.cascaded)}`
          : "Restored as a one-off task";
      return undo.cascaded
        ? `Task and ${subtasks(undo.cascaded)} restored`
        : "Task restored to incomplete";
    }
    if (task.parentId) {
      const { done, total } = subtaskProgress(store.tasks, task.parentId);
      return done + 1 === total
        ? `Subtask completed. All ${total} done.`
        : `Subtask completed. ${done + 1} of ${total} done.`;
    }
    if (undo.cascaded) return `Task and ${subtasks(undo.cascaded)} completed.${next}`;
    return next ? `Task completed.${next}` : "Task completed. A little progress.";
  }
  function deleteTask(task: Task) {
    const repeating = task.recurrence && !task.completedAt;
    const children = store.tasks.filter((item) => item.parentId === task.id).length;
    const its = children === 1 ? "its subtask" : `its ${children} subtasks`;
    setConfirmation({
      title: task.parentId
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
          task.parentId
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
  function renderRow(task: Task, parent: Task | null, children: Task[], nested = false) {
    // Open by default, except in History; a search also opens lists with matching subtasks.
    const expanded =
      (!task.completedAt || (searching && children.some((child) => matchesSearch(child, terms)))) !==
      toggledSubtasks.has(task.id);
    return (
      <TaskRow
        key={task.id}
        task={task}
        project={store.projects.find((project) => project.id === task.projectId)}
        parent={parent}
        subtask={nested}
        terms={searching ? terms : undefined}
        progress={task.parentId ? undefined : subtaskProgress(store.tasks, task.id)}
        subtasks={
          children.length
            ? {
                expanded,
                onToggle: () => toggleSubtasks(task.id),
                children: children.map((child) => renderRow(child, task, [], true)),
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
          task.parentId === null && !task.completedAt ? () => addSubtask(task) : undefined
        }
      />
    );
  }
  function renderTasks(tasks: Task[]) {
    return (
      <ul className={sectionStyles["task-list"]}>
        {nestTasks(tasks, store.tasks, shownParents).map((entry) =>
          renderRow(entry.task, entry.parent, entry.subtasks),
        )}
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
    <div className={`${styles["app-shell"]} ${sidebarOpen ? "" : styles["sidebar-collapsed"]}`}>
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
        <header className={styles.topbar}>
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
                                  task.projectId === project.id &&
                                  !task.completedAt,
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
                    <>
                      {(!searching || dueTodayTasks.length > 0) && (
                        <TaskSection
                          title="Today"
                          tasks={dueTodayTasks}
                          expanded={todayExpanded}
                          onToggle={() => setTodayExpanded((value) => !value)}
                          date={new Date(`${today}T12:00:00`).toLocaleDateString("en", {
                            month: "short", day: "numeric",
                          })}
                        >
                          {renderTasks(dueTodayTasks)}
                        </TaskSection>
                      )}
                      {overdueCount > 0 && (
                        <TaskSection
                          title="Overdue"
                          tasks={overdueTasks}
                          expanded={overdueExpanded}
                          onToggle={() => setOverdueExpanded((value) => !value)}
                          overdue
                        >
                          {renderTasks(overdueTasks)}
                        </TaskSection>
                      )}
                    </>
                  ) : view === "upcoming" ? (
                    [...new Set(visibleTasks.map((task) => task.dueDate!))]
                      .sort()
                      .map((date) => (
                        <section className={sectionStyles["task-section"]} key={date}>
                          <h2 className={sectionStyles["section-heading"]}>
                            {dateLabel(date)}
                            <span>
                              {
                                visibleTasks.filter(
                                  (task) => task.dueDate === date,
                                ).length
                              }
                            </span>
                            <span className={sectionStyles["section-date"]}>
                              {new Date(`${date}T12:00:00`).toLocaleDateString(
                                "en",
                                { weekday: "long" },
                              )}
                            </span>
                          </h2>
                          {renderTasks(
                            visibleTasks.filter(
                              (task) => task.dueDate === date,
                            ),
                          )}
                        </section>
                      ))
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
                  {!searching && visibleTasks.length === 0 && view !== "today" && (
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
      {composer && (
        <Dialog
          title={
            composer.initial.parentId
              ? composer.id
                ? "Edit subtask"
                : "Add subtask"
              : composer.id
                ? "Edit task"
                : "Add task"
          }
          onClose={() => setComposer(null)}
        >
          <TaskComposer
            initial={composer.initial}
            projects={store.projects}
            editing={!!composer.id}
            completed={composer.completed}
            parentTitle={composer.parentTitle}
            subtasks={composer.subtasks}
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
      {notice && (
        <div className={styles.toast} role="status">
          <CircleCheck size={17} />
          <span className={styles["toast-message"]}>{notice}</span>
          {undoCompletion && (
            <button
              className={styles["toast-undo"]}
              onClick={() => {
                store.undoToggle(undoCompletion);
                setNotice(
                  undoCompletion.previous.find((item) => item.id === undoCompletion.id)
                    ?.completedAt
                    ? "Restore undone"
                    : "Completion undone",
                );
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
