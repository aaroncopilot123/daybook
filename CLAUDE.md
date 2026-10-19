# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run build` — production build (also the main type check; there is no separate `tsc` script)
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript)

There is no test suite.

## Stack notes

- Next.js 16.4 (App Router), React 19.3, TypeScript, Tailwind CSS v4 (via `@tailwindcss/postcss`), `lucide-react` icons.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`. As AGENTS.md says, this Next.js differs from older versions — check `node_modules/next/dist/docs/` before using framework APIs.

## Architecture

"Daybook" is currently a **client-only** task app; there is no backend, auth, or database yet.

- `app/page.tsx` renders `TaskApp` (`app/components/task-app.tsx`), a single `"use client"` component that owns all UI state: current `View`, selected project filter, sidebar/drawer, composer/project-editor/confirmation dialogs, toast notices with undo, and the `q` quick-add shortcut. Other components in `app/components/` are presentational pieces driven by its props.
- `app/lib/tasks.ts` holds the domain model (`Task`, `Project`, `Snapshot` with `version: 2`; version 1 data is migrated on load), date helpers (dates are local `YYYY-MM-DD` strings; `localDate(offset)`), recurrence rules (`Recurrence`, `nextDueDate`, `recurrenceLabel`), smart date and repeat parsing (`findDateToken`), view filtering (`matchesView` — view and project are independent filters), seed data, and strict validation in `loadSnapshot`.
- `app/lib/use-tasks.ts` is the store: it loads the snapshot from `localStorage` (`daybook.tasks.v1`) in a microtask after hydration and persists every mutation through `commit()`. If saved data fails validation, the app runs in a temporary session and **never overwrites** the existing stored data (`canSave` stays false). Storage failures surface as `storageError` rather than throwing.
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
