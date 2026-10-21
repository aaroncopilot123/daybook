# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run build` — production build (also the main type check; there is no separate `tsc` script)
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript)
- `npm test` — Vitest unit tests in `__tests__/` (one `*.test.ts` per module, e.g. `__tests__/quick-add.test.ts` for `app/lib/quick-add.ts`; `vitest.config.mts` maps the `@/` alias). Pure `app/lib` logic only, no component tests.

## Stack notes

- Next.js 16.4 (App Router), React 19.3, TypeScript, Tailwind CSS v4 (via `@tailwindcss/postcss`), `lucide-react` icons.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`. As AGENTS.md says, this Next.js differs from older versions — check `node_modules/next/dist/docs/` before using framework APIs.

## Architecture

"Daybook" is currently a **client-only** task app; there is no backend, auth, or database yet.

- `app/page.tsx` renders `TaskApp` (`app/components/task-app.tsx`), a single `"use client"` component that owns all UI state: current `View` (`all`, `today`, `history`, `projects`), selected project filter, sidebar/drawer, composer/project-editor/confirmation dialogs, toast notices with undo, and the `q` quick-add shortcut. Other components in `app/components/` are presentational pieces driven by its props.
- `app/lib/tasks.ts` holds the domain model (`Task`, `Project`, `Snapshot` with `version: 7`; versions 1–6 are migrated on load, v4 renamed the task keys to snake_case to match the planned PostgreSQL columns: `project_id`, `due_date`, `parent_id`, `completed_at`, `created_at`, `updated_at`; v5 added a manual-order `sequence`; v6 added `deleted_at`; v7 dropped `sequence`), date helpers (dates are local `YYYY-MM-DD` strings; `localDate(offset)`), recurrence rules (`Recurrence`, `nextDueDate`, `recurrenceLabel`), subtasks (`parent_id`, one level deep: a subtask's parent is top-level, shares its project and never repeats; `nestTasks` builds list rows so a shown parent carries its subtasks and other subtasks stand alone with a breadcrumb), ordering (there is no manual order: every list, subtasks included, is sorted by `created_at` oldest first with `byCreated`, so new tasks land at the end; Sort by priority is a client-side sort on top of it, and History sorts by `completed_at`), view filtering (`matchesView` — view and project are independent filters), soft deletes (a deleted task stays as a tombstone with `deleted_at`; only `isLive` tasks show anywhere or take part in any change, and `parseSnapshot` drops tombstones older than `TOMBSTONE_DAYS`), seed data, and strict validation in `parseSnapshot`.
- `app/lib/quick-add.ts` parses typed quick-add in task titles (`parseTitle`: dates, repeat phrases, `#project`, `p1`–`p4`; last match per kind wins) with `stripTokens` to remove them on save. It's pure: pass `today`/`dayFirst` to make results deterministic.
- `app/lib/search.ts` is the plain-text task matcher (`fold`, `searchTerms`, `matchesSearch`, `matchRanges` for highlights): case- and accent-insensitive, every word must match the title or description. `TaskApp` owns the search query (session-only, kept across views), applies it after `matchesView`, and focuses the bar on `/`.
- `app/lib/mutations.ts` holds every data change as a pure function of the snapshot and a `Clock` (`now`, `today`, `newId`). Each returns `changes`, the rows it inserted or changed (a delete is a change to `deleted_at`; only projects are removed for real), with its result (an undo record or a save summary). `applyChanges` applies them. These are the rows a backend will write.
- `app/lib/use-tasks.ts` is the store, a thin wrapper around `mutations.ts`: it loads the snapshot from `localStorage` (`daybook.tasks.v1`) in a microtask after hydration, and `commit(changes)` applies each mutation's changes and saves. `loadSnapshot` reads storage; `parseSnapshot` (pure) migrates and validates. If saved data fails validation, the app runs in a temporary session and **never overwrites** the existing stored data (`canSave` stays false). Storage failures surface as `storageError` rather than throwing. `toggleTask` cascades (completing a parent completes its open subtasks; restoring a subtask reopens its parent; a recurring parent's next occurrence gets fresh copies of its subtasks) and returns a `ToggleUndo` that `undoToggle` reverses in one step. `saveTask(draft, id?, subtasks?)` also takes the composer's staged final subtask list (`SubtaskDraft[]` with title, description and done, edited in `subtask-editor.tsx`) and applies the difference (delete, edit, add; kept subtasks keep their creation order, and new ones are created a millisecond apart so they follow in typed order) in the same commit; leaving it `undefined` keeps the children unchanged. `deleteTask` soft-deletes a task with its live subtasks and returns a `DeleteUndo` for `undoDelete`. The store exposes only live tasks as `tasks`.
- The sidebar's views are All tasks, Today and History (plus the projects grid). Today groups Today with Overdue; All tasks shows Overdue, Today, No date, then every day from tomorrow, loading `UPCOMING_PAGE` more days as a sentinel scrolls near (`upcomingDays` also keeps later days that have tasks), and only matching sections and days while searching. Section lists leave out subtasks whose parent is shown, since they sit under it. There is no drag-and-drop or manual reordering; a task's day changes only through its due date in the composer.
- Theme: `app/lib/theme.ts` exports an inline script injected in `app/layout.tsx`'s `<head>` that sets `<html data-theme>` before paint (default `dark`, stored as `daybook.theme`). `use-theme.ts` reads it via `useSyncExternalStore` and a custom `daybook:theme-change` event.

## Styling

- Plain CSS, not Tailwind utilities (Tailwind is imported only for its preflight reset and `sr-only`).
- `app/globals.css` holds only truly global styles: color tokens (dark on `:root`, light under `:root[data-theme="light"]`), element base rules, and the shared primitives `.button`, `.primary`, `.secondary`, `.destructive`, `.icon-button`, `.skip-link`, which components use as plain string classes. Add new colors as tokens in both theme blocks rather than hard-coding values.
- Each component's styles live in a CSS Module next to it (`task-row.tsx` + `task-row.module.css`), keeping kebab-case class names accessed as `styles["task-row"]`. A module's responsive `@media` overrides sit in the same file. Parents reuse a child's classes by importing its module (task-app imports `task-section.module.css` and `sidebar.module.css`).
- When a module selector combines with a global primitive, wrap the primitive in `:global()` (e.g. `:global(.icon-button).theme-toggle`) so it keeps beating the primitive by specificity. Don't rely on the order stylesheets load in, because Next.js can order CSS differently in dev than in `next build`.
- Keyframes are scoped too: define `@keyframes` in the module that uses them.
- `docs/design.md` is the design system (Linear-inspired: dark-first, single indigo accent, Inter with `cv01`/`ss03` features, weight 510 for emphasis, luminance stacking for elevation, 100–200ms motion, 44px touch targets, accessibility contract). Follow it for UI work.

## Product direction

`docs/REQUIREMENTS.md` defines the target MVP: tasks with projects/priorities/due dates, Inbox/Today/Upcoming/project views, scheduled work sessions on a calendar, read-only Google Calendar, PostgreSQL, Google auth (Auth.js). Key invariants to preserve as features land: a task's deadline is independent of its scheduled sessions; a task can have multiple sessions; completing or rescheduling a session never completes the task or changes its deadline; Google Calendar failures must not block task management.
