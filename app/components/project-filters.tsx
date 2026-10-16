"use client";

import { Hash, Layers2 } from "lucide-react";
import type { Project } from "../lib/tasks";

export function ProjectFilters({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div
      className="project-filters"
      role="group"
      aria-label="Filter by project"
    >
      <button
        className={`project-filter ${selectedProjectId === null ? "selected" : ""}`}
        aria-pressed={selectedProjectId === null}
        onClick={() => onSelect(null)}
      >
        <Layers2 size={14} />
        All projects
      </button>
      {projects.map((project) => (
        <button
          key={project.id}
          className={`project-filter ${selectedProjectId === project.id ? "selected" : ""}`}
          aria-pressed={selectedProjectId === project.id}
          onClick={() => onSelect(project.id)}
        >
          <Hash size={14} />
          <span>{project.name}</span>
        </button>
      ))}
    </div>
  );
}
