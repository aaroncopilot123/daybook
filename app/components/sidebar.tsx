"use client";

import { useId } from "react";
import {
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
import styles from "./sidebar.module.css";

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
    { id: "history" as const, label: "History", Icon: History },
  ];
  return (
    <div className={styles["sidebar-inner"]}>
      <div className={styles["brand-row"]}>
        <span className={styles["brand-symbol"]}>
          <CheckCheck size={20} strokeWidth={2} />
        </span>
        <span className={styles["brand-name"]}>
          daybook<span className={styles["brand-dot"]}>.</span>
        </span>
        {onClose ? (
          <button
            className={`icon-button ${styles["sidebar-close"]}`}
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        ) : (
          <button
            type="button"
            className={`icon-button ${styles["sidebar-close"]}`}
            aria-label="Collapse navigation"
            aria-controls="desktop-navigation"
            aria-expanded={true}
            onClick={onCollapse}
          >
            <ChevronsLeft size={18} />
          </button>
        )}
      </div>
      <div className={styles["workspace-label"]}>
        <span className={styles.avatar}>H</span>
        <span>
          My workspace
          <span className={styles["workspace-subtitle"]}>A little more intentional.</span>
        </span>
      </div>
      <button className={styles["sidebar-add"]} onClick={onAddTask}>
        <span>
          <Plus size={16} />
        </span>
        Add task<kbd>Q</kbd>
      </button>
      <nav aria-label="Main navigation">
        {links.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`${styles["nav-item"]} ${view === id ? styles.active : ""}`}
            onClick={() => navigate(id)}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
            <span className={styles["nav-count"]}>
              {
                tasks.filter((task) =>
                  matchesView(task, id, today, selectedProjectId),
                ).length
              }
            </span>
          </button>
        ))}
      </nav>
      <div className={styles["projects-heading"]}>
        <button
          type="button"
          onClick={onToggleProjects}
          aria-expanded={projectsExpanded}
          aria-controls={projectsId}
          className={view === "projects" ? styles.selected : ""}
        >
          <ChevronDown size={13} className={styles["projects-chevron"]} />
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
        className={styles["sidebar-projects"]}
        aria-label="Projects"
        hidden={!projectsExpanded}
      >
        <button
          className={`${styles["nav-item"]} ${selectedProjectId === null ? styles.active : ""}`}
          onClick={() => onSelectProject(null)}
          aria-pressed={selectedProjectId === null}
        >
          <Layers2 size={17} />
          <span>All projects</span>
          <span className={styles["nav-count"]}>
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
            className={`${styles["nav-item"]} ${selectedProjectId === project.id ? styles.active : ""}`}
            onClick={() => onSelectProject(project.id)}
            aria-pressed={selectedProjectId === project.id}
          >
            <Hash size={17} className={styles[`project-tone-${index % 3}`]} />
            <span className={styles["nav-project-name"]}>{project.name}</span>
            <span className={styles["nav-count"]}>
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
          className={`${styles["nav-item"]} ${styles["browse-projects"]}`}
          onClick={() => navigate("projects")}
        >
          <Layers2 size={16} />
          <span>Browse projects</span>
        </button>
      </nav>
    </div>
  );
}
