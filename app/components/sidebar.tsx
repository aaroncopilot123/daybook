"use client";

import { useId } from "react";
import {
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronsLeft,
  Hash,
  ListTodo,
  History,
  Layers2,
  Plus,
  Sun,
  X,
} from "lucide-react";
import { matchesView, type Project, type Task, type View } from "../lib/tasks";

export function Sidebar({
  view,
  navigate,
  tasks,
  projects,
  today,
  onAddTask,
  onAddProject,
  onClose,
  onCollapse,
  projectsExpanded,
  onToggleProjects,
  selectedProjectId,
  onSelectProject,
}: {
  view: View;
  navigate: (view: View) => void;
  tasks: Task[];
  projects: Project[];
  today: string;
  onAddTask: () => void;
  onAddProject: () => void;
  onClose?: () => void;
  onCollapse?: () => void;
  projectsExpanded: boolean;
  onToggleProjects: () => void;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
}) {
  const projectsId = useId();
  const links = [
    { id: "all" as const, label: "All tasks", Icon: ListTodo },
    { id: "today" as const, label: "Today", Icon: Sun },
    { id: "upcoming" as const, label: "Upcoming", Icon: CalendarDays },
    { id: "history" as const, label: "History", Icon: History },
  ];
  return (
    <div className="sidebar-inner">
      <div className="brand-row">
        <span className="brand-symbol">
          <CheckCheck size={20} strokeWidth={2} />
        </span>
        <span className="brand-name">
          daybook<span className="brand-dot">.</span>
        </span>
        {onClose ? (
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Collapse navigation"
            aria-controls="desktop-navigation"
            aria-expanded={true}
            onClick={onCollapse}
          >
            <ChevronsLeft size={18} />
          </button>
        )}
      </div>
      <div className="workspace-label">
        <span className="avatar">H</span>
        <span>
          My workspace
          <span className="workspace-subtitle">A little more intentional.</span>
        </span>
      </div>
      <button className="sidebar-add" onClick={onAddTask}>
        <span>
          <Plus size={16} />
        </span>
        Add task<kbd>Q</kbd>
      </button>
      <nav aria-label="Main navigation">
        {links.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-item ${view === id ? "active" : ""}`}
            onClick={() => navigate(id)}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
            <span className="nav-count">
              {
                tasks.filter((task) =>
                  matchesView(task, id, today, selectedProjectId),
                ).length
              }
            </span>
          </button>
        ))}
      </nav>
      <div className="projects-heading">
        <button
          type="button"
          onClick={onToggleProjects}
          aria-expanded={projectsExpanded}
          aria-controls={projectsId}
          className={view === "projects" ? "selected" : ""}
        >
          <ChevronDown size={13} className="projects-chevron" />
          My projects
        </button>
        <button
          className="icon-button"
          aria-label="Add project"
          onClick={onAddProject}
        >
          <Plus size={15} />
        </button>
      </div>
      <nav
        id={projectsId}
        className="sidebar-projects"
        aria-label="Projects"
        hidden={!projectsExpanded}
      >
        <button
          className={`nav-item ${selectedProjectId === null ? "active" : ""}`}
          onClick={() => onSelectProject(null)}
          aria-pressed={selectedProjectId === null}
        >
          <Layers2 size={17} />
          <span>All projects</span>
          <span className="nav-count">
            {
              tasks.filter((task) =>
                matchesView(task, view === "projects" ? "all" : view, today),
              ).length
            }
          </span>
        </button>
        {projects.map((project, index) => (
          <button
            key={project.id}
            className={`nav-item ${selectedProjectId === project.id ? "active" : ""}`}
            onClick={() => onSelectProject(project.id)}
            aria-pressed={selectedProjectId === project.id}
          >
            <Hash size={17} className={`project-tone-${index % 3}`} />
            <span className="nav-project-name">{project.name}</span>
            <span className="nav-count">
              {
                tasks.filter((task) =>
                  matchesView(
                    task,
                    view === "projects" ? "all" : view,
                    today,
                    project.id,
                  ),
                ).length
              }
            </span>
          </button>
        ))}
        <button
          className="nav-item browse-projects"
          onClick={() => navigate("projects")}
        >
          <Layers2 size={16} />
          <span>Browse projects</span>
        </button>
      </nav>
    </div>
  );
}
