"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Sun,
  Trash2,
} from "lucide-react";
import {
  dateLabel,
  localDate,
  matchesView,
  type Project,
  type Task,
  type TaskDraft,
  type View,
} from "../lib/tasks";
import { useTasks } from "../lib/use-tasks";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { ProjectFilters } from "./project-filters";
import { TaskRow } from "./task-row";
import { TaskComposer } from "./task-composer";
import { Dialog } from "./dialog";
import { TaskSection } from "./task-section";

type Composer = { initial: TaskDraft; id?: string };
type Confirmation = { title: string; message: string; action: () => void };
const blankDraft = (view: View): TaskDraft => ({
  title: "",
  description: "",
  dueDate: view === "upcoming" ? null : localDate(),
  projectId: null,
  priority: null,
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
    if (!sidebarOpen) reopenNavigation.current?.focus();
  }, [sidebarOpen]);
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
  const [undoCompletion, setUndoCompletion] = useState<{
    id: string;
    completedAt: string | null;
  } | null>(null);

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
      if (
        event.key.toLowerCase() !== "q" ||
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
    .filter((task) => matchesView(task, view, today, selectedProjectId))
    .sort((a, b) =>
      view === "history"
        ? b.completedAt!.localeCompare(a.completedAt!) ||
          b.createdAt.localeCompare(a.createdAt)
        : prioritySort
          ? (a.priority ?? 5) - (b.priority ?? 5) ||
            a.createdAt.localeCompare(b.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
    );
  const overdueTasks = visibleTasks.filter(
    (task) => task.dueDate && task.dueDate < today,
  );
  const overdueCount = overdueTasks.length;
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
      },
      id: task.id,
    });
  }
  function saveTask(draft: TaskDraft) {
    store.saveTask(draft, composer?.id);
    setNotice(
      composer?.id
        ? "Task updated"
        : view === "history"
          ? "Task added. Find it in All."
          : "Task added",
    );
    setComposer(null);
  }
  function deleteTask(task: Task) {
    setConfirmation({
      title: "Delete task?",
      message: `“${task.title}” will be permanently deleted.`,
      action: () => {
        store.deleteTask(task.id);
        setNotice("Task deleted");
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
  function renderTasks(tasks: Task[]) {
    return (
      <ul className="task-list">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            project={store.projects.find(
              (project) => project.id === task.projectId,
            )}
            onToggle={() => {
              store.toggleTask(task.id);
              setNotice(
                task.completedAt
                  ? "Task restored to incomplete"
                  : "Task completed. A little progress.",
              );
              setUndoCompletion({ id: task.id, completedAt: task.completedAt });
            }}
            onEdit={() => editTask(task)}
            onDelete={() => deleteTask(task)}
          />
        ))}
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
    <div className={`app-shell${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      <a href="#main-content" className="skip-link">
        Skip to tasks
      </a>
      <aside
        ref={desktopNavigation}
        id="desktop-navigation"
        className="desktop-sidebar"
        hidden={!sidebarOpen}
      >
        <Sidebar {...sidebarProps} onCollapse={() => setSidebarOpen(false)} />
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            {!sidebarOpen && (
              <button
                ref={reopenNavigation}
                type="button"
                className="icon-button desktop-reopen"
                aria-label="Expand navigation"
                aria-controls="desktop-navigation"
                aria-expanded={false}
                onClick={() => {
                  setSidebarOpen(true);
                  window.requestAnimationFrame(() => {
                    desktopNavigation.current
                      ?.querySelector<HTMLButtonElement>("button")
                      ?.focus();
                  });
                }}
              >
                <Menu size={20} />
              </button>
            )}
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={20} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={13} />
            <span className="breadcrumb-current">{title}</span>
          </div>
          <div className="header-actions">
            <span className="topbar-right">
              <span className="status-dot" />
              Personal workspace
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {store.storageError && (
            <div role="alert" className="storage-error">
              {store.storageError}
            </div>
          )}
          {!store.ready || !today ? (
            <div className="loading-state" role="status">
              <div className="skeleton skeleton-title" />
              <div className="skeleton" />
              <div className="skeleton" />
              <span className="sr-only">Loading your tasks</span>
            </div>
          ) : (
            <>
              <div className="page-eyebrow">
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
              <div className="page-heading">
                <h1>
                  {title}
                  <span
                    className={`heading-icon${view === "today" ? " heading-icon-today" : ""}`}
                    aria-hidden="true"
                  >
                    <HeadingIcon size={27} strokeWidth={1.5} />
                  </span>
                </h1>
                <div className="heading-actions">
                  {view !== "history" && (
                    <button
                      className="button primary desktop-add"
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
              <p className="page-subtitle">
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
                <div className="daily-progress">
                  <div className="progress-icon">
                    <CircleCheck size={20} strokeWidth={1.5} />
                  </div>
                  <div className="progress-copy">
                    <span>Due today</span>
                    <span>
                      {todayTasks.length === 0
                        ? "No tasks due today"
                        : `${todayCompleted} of ${todayTasks.length} completed`}
                      {overdueCount > 0 && ` · ${overdueCount} overdue below`}
                    </span>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="Today's completion"
                    aria-valuetext={`${todayCompleted} of ${todayTasks.length} tasks due today completed; overdue tasks excluded`}
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <span className="progress-number">{progress}%</span>
                </div>
              )}
              {view === "projects" ? (
                <div className="project-list">
                  {store.projects.map((project, index) => (
                    <div className="project-card" key={project.id}>
                      <button
                        className="project-card-main"
                        onClick={() => {
                          selectProject(project.id);
                          setView("all");
                        }}
                      >
                        <span
                          className={`project-icon project-tone-${index % 3}`}
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
                      <div className="project-card-actions">
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
                  <ProjectFilters
                    projects={store.projects}
                    selectedProjectId={selectedProjectId}
                    onSelect={selectProject}
                  />
                  <div className="list-toolbar">
                    <span>
                      {visibleTasks.length}{" "}
                      {visibleTasks.length === 1 ? "task" : "tasks"}
                      <span className="toolbar-dot">·</span>
                      {view === "today"
                        ? "You’ve got this"
                        : "One thing at a time"}
                    </span>
                    {view === "history" ? (
                      <span>Newest completed first</span>
                    ) : (
                      <button
                        className={`sort-button ${prioritySort ? "sort-active" : ""}`}
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
                        <section className="task-section" key={date}>
                          <h2 className="section-heading">
                            {dateLabel(date)}
                            <span>
                              {
                                visibleTasks.filter(
                                  (task) => task.dueDate === date,
                                ).length
                              }
                            </span>
                            <span className="section-date">
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
                  {visibleTasks.length === 0 && view !== "today" && (
                    <div className="empty-state">
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
              <footer className="content-footer">
                <span className="footer-line" />
                <span className="footer-line" />
              </footer>
            </>
          )}
        </main>
        {store.ready && view !== "history" && (
          <button
            className="mobile-fab"
            aria-label={view === "projects" ? "New project" : "Add task"}
            onClick={() =>
              view === "projects" ? setProjectEditor({ name: "" }) : addTask()
            }
          >
            <Plus size={24} />
          </button>
        )}
      </div>
      {drawer && (
        <Dialog
          title="Your workspace"
          className="navigation-dialog"
          onClose={() => setDrawer(false)}
        >
          <Sidebar {...sidebarProps} onClose={() => setDrawer(false)} />
        </Dialog>
      )}
      {composer && (
        <Dialog
          title={composer.id ? "Edit task" : "Add task"}
          className="composer-dialog"
          onClose={() => setComposer(null)}
        >
          <TaskComposer
            initial={composer.initial}
            projects={store.projects}
            editing={!!composer.id}
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
            className="project-form"
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
            <div className="dialog-actions">
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
          <div className="confirmation-body">
            <p>{confirmation.message}</p>
            <div className="dialog-actions">
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
        <div className="toast" role="status">
          <CircleCheck size={17} />
          <span className="toast-message">{notice}</span>
          {undoCompletion && (
            <button
              className="toast-undo"
              onClick={() => {
                store.setTaskCompletion(
                  undoCompletion.id,
                  undoCompletion.completedAt,
                );
                setNotice("Completion undone");
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
