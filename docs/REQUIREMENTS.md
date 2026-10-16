# Personal Productivity App — Project Requirements

**Version:** 1.0  
**Date:** October 2026

## 1. Product overview

A mobile-friendly productivity app combining Todoist-style task management with Google Calendar scheduling, built using Next.js. Users can manage tasks, see existing calendar commitments, and plan when to work in one application.

The product distinguishes three concepts:

- **Task:** Something that needs to be completed.
- **Deadline:** The latest date by which a task should be completed.
- **Scheduled session:** A block of time allocated to working on a task.

A task can exist without a deadline or a scheduled session. One task can have multiple work sessions.

### Product principles

1. **Capture quickly:** Adding a task requires minimal effort.
2. **Plan realistically:** Show tasks and calendar commitments together.
3. **Stay flexible:** Unfinished tasks remain available and are never automatically completed.
4. **Prioritize mobile usability:** The same application works well on desktop and phone.
5. **Build incrementally:** Keep the MVP small enough to finish and use personally.

## 2. Scope

### MVP

- Create, edit, complete, reopen, and delete tasks.
- Inbox, Today, Upcoming, and project views.
- Projects, priorities, and due dates.
- Responsive desktop and mobile layouts.
- Daily and weekly calendar views.
- Schedule and reschedule task sessions.
- Read Google Calendar events.
- PostgreSQL persistence.
- Google authentication.

### Deferred features

- Recurring tasks.
- Subtasks and labels.
- Natural-language task input.
- Two-way Google Calendar synchronization.
- Push notifications and reminders.
- Offline editing and synchronization.
- Calendar drag-and-drop scheduling.
- Installable progressive web app (PWA).
- Habit tracking, Pomodoro, time tracking, and analytics.

**MVP success criterion:** Users can manage real tasks, schedule work, and see Google Calendar commitments on phone and desktop without switching between apps.

The MVP excludes advanced notification infrastructure, offline synchronization, and editing Google Calendar events.

## 3. Functional requirements

### FR-01 — Task management

Users must be able to create, edit, delete, complete, and reopen tasks.

| Field | Required | Notes |
| --- | --- | --- |
| Title | Yes | Task name |
| Description | No | Additional details |
| Project | No | Tasks without a project belong to Inbox |
| Priority | No | P1–P4 |
| Due date | No | Task deadline, independent of scheduled sessions |
| Status | Yes | System-managed |
| Created and updated timestamps | Yes | System-managed |

Completed tasks remain stored rather than being permanently deleted.

### FR-02 — Task views

| View | Contents |
| --- | --- |
| Inbox | Tasks not assigned to a project |
| Today | Tasks due today, overdue tasks, and tasks scheduled for today |
| Upcoming | Future tasks organized chronologically |
| Projects | Tasks grouped by user-created project |

Users can complete tasks directly from any view.

### FR-03 — Calendar and scheduled sessions

- Users can switch between daily and weekly calendar views.
- The calendar visually distinguishes Google Calendar events from scheduled task sessions.
- Users can select a task, assign a start and end time, and see its session on the calendar.
- Users can edit, reschedule, and remove sessions without deleting the underlying task.
- A task can have multiple scheduled sessions.
- Completing a scheduled session does not automatically complete its task; task completion is an independent action.
- Rescheduling a session does not change the task deadline.

### FR-04 — Google Calendar integration

- Users can sign in with Google and explicitly grant read-only calendar access.
- The application retrieves Google Calendar events and displays them alongside task sessions.
- Google Calendar events are read-only; users cannot modify them through the app.
- Calendar availability failures must not prevent task management.
- Users can disconnect the integration.
- All-day and overlapping events display correctly.

### FR-05 — Mobile experience

Use a responsive Next.js application with touch-friendly controls, compact navigation, a usable calendar, and fast task entry.

A separate React Native implementation is not required. Installing the website as a standalone PWA is a later enhancement; the initial design should make that straightforward.

## 4. Main user journeys

### Capture a task

Open app → Create task → Optionally assign a deadline or priority → Save to Inbox.

### Schedule a task

Select task → Open scheduling dialog → Choose a start time and duration → See the session on the calendar.

### Plan the week

Open weekly calendar → View Google commitments → Identify free slots → Schedule task sessions.

### Finish or reschedule

Complete a task from Today, or move an unfinished work session without changing its deadline.

## 5. Technical architecture

The following technologies are recommendations from the source requirements. The ORM choice remains open.

| Layer | Recommended technology |
| --- | --- |
| Frontend | Next.js App Router, React, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Calendar UI | FullCalendar |
| Backend | Next.js Server Actions / Route Handlers |
| Database | PostgreSQL |
| ORM | Prisma or Drizzle |
| Authentication | Auth.js with Google |
| Calendar data | Google Calendar API |
| Deployment | Vercel |
| Mobile | Responsive web, then PWA |

### Initial database entities

| Entity | Purpose |
| --- | --- |
| User | Account and timezone |
| Project | Task organization |
| Task | Task details, deadline, and completion |
| WorkSession | Scheduled time blocks belonging to tasks |
| CalendarConnection | Google OAuth connection and synchronization metadata |

External Google Calendar events can initially be fetched and cached without becoming application-owned tasks.

### Data ownership and security

- All database operations must enforce user ownership.
- OAuth tokens must be stored securely on the server and never exposed to the browser.

## 6. MVP acceptance criteria

| ID | Requirement | Successful outcome |
| --- | --- | --- |
| AC-01 | Create a task without a deadline | Task appears in Inbox |
| AC-02 | Set a task deadline | Task appears in the correct date view |
| AC-03 | Schedule a task | Session displays on the calendar |
| AC-04 | Schedule a task twice | Two sessions reference one task |
| AC-05 | Complete a task | Completion persists after reload |
| AC-06 | Connect Google Calendar | Events appear alongside sessions |
| AC-07 | Disconnect Google Calendar | Tasks remain accessible |
| AC-08 | Use mobile and desktop | The same saved task data appears on both |
| AC-09 | Reschedule a session | Task deadline remains unchanged |
| AC-10 | Google API fails | A clear error appears without breaking task management |

## 7. Post-MVP roadmap

These are optional enhancements, not initial MVP commitments.

### Phase 1 — Quality of life

- [ ] Recurring tasks: daily, weekly, and custom recurrence.
- [ ] Subtasks and labels: more detailed task organization.
- [ ] Search and smart filters: find tasks by date, project, and priority.
- [ ] Calendar drag-and-drop: move and resize work sessions visually.

### Phase 2 — Mobile experience

- [ ] Installable PWA: standalone home-screen app.
- [ ] Custom reminders: notifications based on tasks and deadlines.
- [ ] Offline support: view and edit tasks without internet.
- [ ] Quick-add shortcuts: capture tasks with fewer interactions.

### Phase 3 — Advanced productivity

- [ ] Two-way Google Calendar synchronization: create and update Google events.
- [ ] Natural-language entry: parse task scheduling from plain English.
- [ ] Time tracking: compare scheduled and actual work.
- [ ] Analytics dashboard: track completion trends and habits.
- [ ] Habit tracker / Pomodoro: additional productivity tools.

## 8. Development milestones

| Milestone | Deliverables |
| --- | --- |
| M1 — Foundation | Next.js setup, PostgreSQL, authentication, UI shell, and deployment |
| M2 — Task management | Task CRUD, projects, priorities, Inbox, Today, and Upcoming |
| M3 — Calendar scheduling | Day/week views, scheduled work sessions, and rescheduling forms |
| M4 — Google Calendar | OAuth permissions, read-only event retrieval, and combined calendar display |
| M5 — Mobile polish and reliability | Mobile navigation, loading states, errors, accessibility, and reliability |

## 9. Risks and open decisions

### Technical risks

- Calendar timezone correctness.
- Google OAuth setup.
- Recurring-event handling for imported calendar events.
- Keeping tasks separate from scheduled sessions.

### Working assumptions and decisions

- Assume a single-user personal product for the MVP, while implementing authentication and database ownership properly.
- Choose between Prisma and Drizzle before implementing persistence.
- Measure success by using the app as the primary task manager for at least seven consecutive days.

## 10. Implementation priorities

Complete task management first, add scheduling second, and integrate Google Calendar third. Each milestone should deliver usable functionality.

The core differentiator is a task backlog and a calendar of real commitments in one place.

**Working product requirement:** Users should be able to capture what they need to do, decide when to work on it, see their actual availability, and complete tasks from one responsive application.
