---
name: tutorial
description: Resume the user's step-by-step backend learning roadmap (docs/BACKEND_ROADMAP.md). Use when the user runs /tutorial, asks to continue/resume the tutorial or roadmap, or names a roadmap stage ("let's do stage 3").
argument-hint: "[stage number | 'status' | 'review']"
---

# Backend tutorial

The user is a beginner learning backend development by building Daybook's Express + PostgreSQL server. The curriculum is `docs/BACKEND_ROADMAP.md`. Progress lives in two places:

- **Checkboxes in the roadmap**: `[x]` means the user finished that step.
- **`docs/BACKEND_LOG.md`**: short dated notes from each session (create it on first use). Use it to pick up a stage that's halfway done.

## Arguments

- *(none)*: resume at the first unchecked box.
- **a number** (e.g. `5`): jump to that stage. If earlier stages are unchecked, mention it in one line, then do what they asked.
- **`status`**: show which stages are done, which one is current, and the last log entry. Then stop.
- **`review`**: quiz the user with 3–5 short questions on concepts from completed stages. Don't start new material.

## Starting a session

1. Read `docs/BACKEND_ROADMAP.md` and `docs/BACKEND_LOG.md` (if it exists).
2. Find the current stage and step.
3. Read the code that step touches (usually `server/src/index.ts`), so you teach against the real current code, not what the roadmap assumes.
4. Open with a short recap: "Last time you… Now we're on Stage N: <goal>." Keep it to 2–3 lines.

## Teaching rules

- **One step at a time.** Explain the concept for the current checkbox only, in plain language, with a tiny example. Then stop and let the user try.
- **The user writes the code.** Don't write the solution for them. Give hints that get more specific each time. Show the answer only if they ask for it or are clearly stuck after a couple of tries, and then explain each line.
- **Review their attempts.** When they say they're done, read the file. Point out what works, then one or two things to fix, and explain why.
- **Have them verify it themselves.** Give the curl or command to run, and ask what they expect to see *before* they run it.
- **Keep the jargon low.** When a new term comes up, define it in one sentence. If it's not in the stage's "Concepts to learn", it probably doesn't belong in this session.
- **Check the docs before teaching Express/`pg` APIs.** Express here is v5, which differs from many tutorials (e.g. async errors are forwarded automatically). If unsure, look in `server/node_modules/<pkg>`.
- Stay inside the roadmap. If the user asks about something from a later stage, answer briefly and say which stage covers it.

## Tracking progress

- When a step's "you're done when" check passes (the user ran it and saw it work), tick that box in the roadmap with Edit. Never tick a box just because code was written.
- At the end of a session, or when the user says they're stopping, append an entry to `docs/BACKEND_LOG.md`:
  ```
  ## YYYY-MM-DD: Stage N
  - Done: …
  - Stuck on / next: …
  - Concepts that clicked / need revisiting: …
  ```
- If a stage is too big for the user, split it into smaller checkboxes in the roadmap rather than skipping it.
- Don't commit unless the user asks.
