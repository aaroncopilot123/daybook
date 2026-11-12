# Backend Roadmap

A step-by-step path from "Express hello world" to a real backend for Daybook. Each stage adds **one** new idea. Don't skip ahead: later stages assume the earlier ones make sense.

## How to use this roadmap

- Do **one stage per session**. Small and finished beats big and confusing.
- For each stage: read the concepts, try the steps yourself, then ask Claude to explain anything unclear or review your attempt.
- Tick the boxes (`[x]`) as you go, so you always know where you are.
- If a stage feels too big, ask for it to be split into smaller pieces.

---

## Stage 0: Where we are now

**Goal:** Understand the code that already exists.

**Concepts to learn**
- **Server**: a program that keeps running and waits for requests.
- **Port**: a numbered "door" on your computer. Our server listens on `4000`.
- **Route**: a rule like "when someone asks for `GET /tasks`, run this function".
- **Request / response**: the client asks (request) and the server answers (response).
- **JSON**: the text format used to send data, e.g. `{ "title": "Buy milk" }`.

**Do it**
- [x] Read `server/src/index.ts` line by line.
- [x] Start the server: `cd server && yarn dev`.
- [x] Find the two routes and the fake `tasks` array.

**You're done when:** you can say in your own words what happens when someone visits `/tasks`.

---

## Stage 1: Talk to your server

**Goal:** Send requests to your server and read what comes back.

**Concepts to learn**
- **HTTP methods**: the verb of a request. `GET` = read, `POST` = create, `PATCH` = update, `DELETE` = delete.
- **Status codes**: a number that says how it went.
  - `200` OK · `201` Created · `204` No Content
  - `400` Bad Request (the client sent bad data) · `404` Not Found
  - `500` Internal Server Error (the server broke)
- **`req.params`**: the variable parts of a URL. In `/tasks/:id`, a visit to `/tasks/1` gives `req.params.id === "1"`.

**Do it**
- [x] Open http://localhost:4000/tasks in the browser.
- [x] Run `curl -i http://localhost:4000/tasks/1` (`-i` shows the status code and headers).
- [x] Run `curl -i http://localhost:4000/tasks/999`.

**You're done when:** you can explain why `GET /tasks/999` returning `200` is wrong.

---

## Stage 2: Fix 404s

**Goal:** Return a proper `404` when a task doesn't exist.

**Concepts to learn**
- **`res.status(code)`**: sets the status code before you send the response.
- **Early return**: handle the "not found" case first, then the happy path.

**Do it**
- [x] In `GET /tasks/:id`, check whether `task` is `undefined`.
- [x] If it is, respond with `404` and a JSON body like `{ "error": "Task not found" }`.
- [x] Test again with curl.

**You're done when:** `curl -i .../tasks/999` shows `404`, and `.../tasks/1` still shows `200`.

---

## Stage 3: Create tasks with POST (still in memory)

**Goal:** Add new tasks by sending data to the server.

**Concepts to learn**
- **Request body**: the data a client sends with `POST`/`PATCH`, available as `req.body`.
- **`express.json()`**: middleware that turns the JSON text in the body into a JS object (it's already in `index.ts`).
- **Server-generated fields**: the server decides `id`, `created_at` and `updated_at`. The client never sends these.
- **`crypto.randomUUID()`**: built into Node and creates unique ids.

**Do it**
- [x] Add `app.post("/tasks", ...)`.
- [x] Build a full `Task` object from `req.body.title` plus default values for the other fields.
- [x] Push it into the array and respond `201` with the new task.
- [x] Test it:
  ```sh
  curl -i -X POST http://localhost:4000/tasks \
    -H "Content-Type: application/json" \
    -d '{"title":"Learn POST"}'
  ```

**You're done when:** after the POST, `GET /tasks` includes your new task.

**Notice:** restart the server and your task is gone. Remember this for Stage 7.

---

## Stage 4: Validation

**Goal:** Reject bad input instead of saving garbage.

**Concepts to learn**
- **Never trust the client**: anyone can send anything with curl, not just your frontend.
- **Validation**: checking the shape and values of input before using it.
- **`400 Bad Request`**: the right answer when the input is wrong.

**Do it**
- [x] Decide the rules. For example: `title` is required, must be a string, and can't be empty after trimming. `priority` is `1`–`4` or `null`. `due_date` looks like `YYYY-MM-DD` or is `null`.
- [x] Write a `validateTaskInput(body)` function that returns either the clean data or a list of errors.
- [x] Return `400` with the errors when validation fails.
- [x] Test with an empty title, a number as the title, and `priority: 9`.

**You're done when:** bad requests get `400` with a helpful message, and good ones still get `201`.

---

## Stage 5: Error handling

**Goal:** Handle errors in one place instead of in every route.

**Concepts to learn**
- **Middleware**: a function that runs on every request, either before or after your routes.
- **Error middleware**: a function with 4 arguments, `(err, req, res, next)`. Express calls it when something throws.
- **Consistent error shape**: every error looks like `{ "error": { "message": "...", "fields"?: {...} } }`.
- **Custom error class**: `class HttpError extends Error` carries a status code, so a route can `throw new HttpError(404, "Task not found")` and let the handler format it.
- **Express 5 forwards thrown errors**: a `throw` inside a route (even an `async` one) reaches the error handler automatically.

**Do it**
- [x] Write an `HttpError` class (status, message, optional fields).
- [x] Add an error handler at the bottom of `index.ts` (after all routes).
- [x] Make it respond with the `HttpError`'s status and message, and for any other error log it and respond `500` with `{ "error": { "message": "Something went wrong" } }`.
- [x] Replace the hand-written `res.status(...).json({ error })` lines in the routes with `throw new HttpError(...)`.
- [x] Temporarily `throw new Error("boom")` in a route to test it, then remove the throw.

**You're done when:** a thrown error gives a clean JSON `500` and the server doesn't crash, a missing task still gives a JSON `404`, and Postman `form-data` no longer returns an HTML error page.

---

## Stage 5b: Validation with a library (Zod)

**Goal:** Replace the hand-written validator with a schema library, now that you know what one does.

**Concepts to learn**
- **Schema**: a description of what valid data looks like, e.g. `z.object({ title: z.string().trim().min(1) })`.
- **`safeParse`**: returns `{ success: true, data }` or `{ success: false, error }`, the same idea as your `{ ok, value | errors }`.
- **`z.infer`**: generates the TypeScript type from the schema, so the type and the rules can't drift apart.
- **`.partial()`**: the same schema with every field optional. This is what PATCH needs.

**Do it**
- [x] `cd server && yarn add zod`
- [x] Rewrite `validate-task.ts` as a Zod schema with the same rules (title, description, priority, due_date, project_id, parent_id, recurrence).
- [x] Turn Zod's errors into your `fields` shape (throw an `HttpError(400, ...)`).
- [x] Re-run the Stage 4 Postman tests. Same results, much less code.

**You're done when:** every Stage 4 test still behaves the same with the Zod version.

---

## Stage 6: Update (PUT) and delete (DELETE)

**Goal:** Finish the full set of CRUD operations (Create, Read, Update, Delete).

**Concepts to learn**
- **PUT vs PATCH**: `PUT` replaces the whole resource (the client sends every field); `PATCH` changes only the fields sent. PUT is simpler but can cause **lost updates** when two devices edit at once.
- **`updated_at`**: set it to "now" on every change.
- **Soft delete**: instead of removing the row, set `deleted_at`. The frontend already works this way (see `deleteTask` in `app/lib/mutations.ts`) so deletes can be undone.
- **`204 No Content`**: success with nothing to send back. It's common for DELETE.

**Do it**
- [x] `DELETE /tasks/:id`: tombstone the task and its live subtasks (same `now`), return `200` with the deleted task (or `204` with no body). 404 if missing or already deleted.
- [x] Change `GET /tasks` and `GET /tasks/:id` to hide deleted tasks.
- [x] `PUT /tasks/:id`: find the task (404 if missing or deleted), validate the full body with `TaskInput`, replace the client-owned fields, keep the server-owned ones, and bump `updated_at`. (Chose PUT over PATCH: simpler, at the cost of possible lost updates across devices.)
- [x] `POST /tasks/:id/complete` and `POST /tasks/:id/reopen`: the server sets or clears `completed_at` (the client never sends a timestamp).

**You're done when:** you can create, read, update and delete a task with curl.

---

## Stage 7: What a database is, and why

**Goal:** Understand why the array isn't enough.

**Concepts to learn**
- **Persistence**: data that survives restarts. Our array doesn't have it.
- **Database**: a separate program that stores data safely on disk and lets many clients use it at once.
- **PostgreSQL ("Postgres")**: the database Daybook will use (see `docs/REQUIREMENTS.md`).
- **Table / row / column**: like a spreadsheet. The table is `tasks`, each row is one task, and each column is a field like `title`.
- **SQL**: the language you use to talk to the database.

**Do it**
- [x] Ask Claude to explain anything above that's fuzzy. No code in this stage.
- [x] Compare the `Task` type in `app/lib/tasks.ts` with the idea of a table and its columns.

**You're done when:** you can explain why restarting the server lost your POSTed task.

---

## Stage 8: Install Postgres and try SQL by hand

**Goal:** Use a database directly, before writing any code for it.

**Concepts to learn**
- **`psql`**: the command-line tool for typing SQL into Postgres.
- **`CREATE TABLE`, `INSERT`, `SELECT`, `UPDATE`, `DELETE`**: the core SQL commands.
- **Column types**: `text`, `integer`, `boolean`, `date`, `timestamptz`.
- **`NOT NULL`**: this column must have a value.
- **Primary key**: the column that uniquely identifies each row (our `id`).

**Do it**
- [x] `brew install postgresql@17`
- [x] `brew services start postgresql@17`
- [x] `createdb daybook_dev`
- [x] `psql daybook_dev`
- [x] Make a practice table, add a few rows, query them, update one and delete one.
- [x] Try `SELECT ... WHERE ...` and `ORDER BY`.

**You're done when:** you can create a table and read rows back without looking anything up.

---

## Stage 9: Design the real schema

**Goal:** Write the `projects` and `tasks` tables Daybook actually needs.

**Concepts to learn**
- **Schema**: the definition of all your tables and their columns.
- **Foreign key**: a column that points at another table's primary key, e.g. `tasks.project_id → projects.id`.
- **CHECK constraint**: a rule the database enforces, e.g. `priority BETWEEN 1 AND 4`.
- **`jsonb`**: a column that stores JSON. It's one option for `recurrence`.
- **`timestamptz` vs `date`**: an exact moment in time (`created_at`) vs a calendar day (`due_date`).

**Do it**
- [ ] Map each field of `Task` (`app/lib/tasks.ts`) to a column type.
- [ ] Decide which columns are `NOT NULL` and which have defaults.
- [ ] Write the `CREATE TABLE` statements and run them in `psql`.
- [ ] Ask Claude to review your schema.

**You're done when:** you can insert a task row that matches the `Task` type exactly.

---

## Stage 10: Migrations

**Goal:** Keep schema changes in files, so the database can be rebuilt any time.

**Concepts to learn**
- **Migration**: a numbered `.sql` file that changes the schema, e.g. `001_init.sql`.
- **Version control for the database**: migrations live in git, so everyone gets the same schema.
- **Migration table**: a small table that remembers which migrations have already run.

**Do it**
- [ ] Move your `CREATE TABLE` statements into `server/migrations/001_init.sql`.
- [ ] Write (or ask for help with) a small script that runs the migrations that haven't run yet.
- [ ] Drop the database, recreate it and run your migrations.

**You're done when:** a fresh database gets the full schema from one command.

---

## Stage 11: Connect Express to Postgres

**Goal:** Make your server talk to the database.

**Concepts to learn**
- **`pg`**: the Node library for Postgres.
- **Connection pool**: a set of reusable database connections, so you don't reconnect on every request.
- **Environment variables / `.env`**: config like `DATABASE_URL` lives outside the code. Never commit secrets.
- **Parameterized queries**: `query("SELECT * FROM tasks WHERE id = $1", [id])`. Never build SQL by gluing strings together.
- **SQL injection**: the attack that parameterized queries prevent.
- **`async` / `await`**: database calls take time, so they return Promises.

**Do it**
- [ ] `cd server && yarn add pg && yarn add -D @types/pg`
- [ ] Create `server/.env` with `DATABASE_URL=postgres://localhost/daybook_dev`, and add it to `.gitignore`.
- [ ] Create `server/src/db.ts` that exports a `Pool`.
- [ ] Add a test route `GET /health/db` that runs `SELECT 1`.

**You're done when:** `/health/db` responds OK, and it fails clearly when Postgres is stopped.

---

## Stage 12: Repository layer

**Goal:** Keep SQL in one place and routes simple.

**Concepts to learn**
- **Separation of concerns**: routes handle HTTP, the repository handles data.
- **Repository**: a module of functions like `listTasks()`, `getTask(id)`, `createTask(data)`.

**Do it**
- [ ] Create `server/src/tasks-repo.ts`.
- [ ] Write `listTasks()` and `getTask(id)` with parameterized SQL.

**You're done when:** your route files contain no SQL.

---

## Stage 13: Swap routes from the array to the database

**Goal:** Make the real routes use Postgres, one at a time.

**Do it**
- [ ] `GET /tasks`: use `listTasks()` (live tasks only, ordered by `created_at`).
- [ ] `GET /tasks/:id`: use `getTask()` and keep the 404.
- [ ] `POST /tasks`: `INSERT ... RETURNING *`.
- [ ] `PUT /tasks/:id`: `UPDATE ... RETURNING *`.
- [ ] `DELETE /tasks/:id`: soft delete with `UPDATE ... SET deleted_at = now()`.
- [ ] Delete the fake `tasks` array.

**You're done when:** you can restart the server and your tasks are still there.

---

## Stage 14: Connect the frontend to the API

**Goal:** The Daybook app saves tasks through your server instead of `localStorage`. Still one user, no sign-in yet.

**Concepts to learn**
- **`fetch`**: how the browser calls your API (`fetch("http://localhost:4000/tasks")`).
- **CORS**: the browser blocks a page on port 3000 from calling port 4000 unless the server allows it.
- **Loading and error states**: a request takes time and can fail. The UI has to show both.

**Do it**
- [ ] Allow the frontend's origin with CORS in Express.
- [ ] Load tasks from `GET /tasks` instead of `localStorage` in `app/lib/use-tasks.ts`.
- [ ] Send creates, edits, completes and deletes to the matching routes.
- [ ] Show an error toast when the server is down, instead of breaking.

**You're done when:** you add a task in the app, restart the server, refresh, and it's still there.

---

## Stage 15: How sign-in works (concepts first)

**Goal:** Understand authentication before writing any of it. Get this wrong and other people can read your tasks.

**Concepts to learn**
- **Authentication vs authorization**: *who are you?* (sign-in) vs *what are you allowed to do?* (only your own tasks).
- **Hashing passwords**, and why we skip passwords entirely by using Google.
- **OAuth / "Sign in with Google"**: Google confirms who the user is, and your app never sees their password.
- **Sessions and cookies**: after sign-in, the browser carries a cookie that proves who it is on every request.
- **Sessions vs tokens (JWT)**: two ways to remember a signed-in user, and their trade-offs.
- **Scopes**: asking Google only for what you need (sign-in now, read-only calendar later).

**Do it**
- [ ] Ask Claude to walk you through what happens, step by step, when someone clicks "Sign in with Google".
- [ ] Decide *where* sign-in lives: **Auth.js in the Next.js app** (what `docs/REQUIREMENTS.md` plans) with Express checking the session, or **sign-in handled by Express** itself. Write down why.

**You're done when:** you can draw the sign-in flow (browser → Google → your app → cookie) and explain who checks the cookie on each API request.

---

## Stage 16: Add Google sign-in

**Goal:** Users sign in with Google, and the server knows who is calling it.

**Concepts to learn**
- **Google Cloud OAuth client**: the client ID and secret that identify your app to Google. Secrets live in `.env`, never in git.
- **`users` table**: one row per person, linked to their Google account.
- **Auth middleware**: runs before your routes, reads the session, sets `req.user`, or answers **`401 Unauthorized`**.

**Do it**
- [ ] Create a Google OAuth client and put its secrets in `.env`.
- [ ] Add a migration for a `users` table.
- [ ] Set up sign-in in the place you chose in Stage 15.
- [ ] Write auth middleware for Express: no valid session → `401`.
- [ ] Add sign-in and sign-out buttons in the app.

**You're done when:** calling `GET /tasks` without signing in gives `401`, and signing in lets you through.

---

## Stage 17: Per-user data

**Goal:** Every user sees and changes only their own tasks and projects.

**Concepts to learn**
- **Ownership**: a `user_id` column on `tasks` and `projects`, as a foreign key to `users`.
- **Authorization checks**: every query filters by `user_id = $1`, and *every* route uses it.
- **`404` vs `403`**: for someone else's task, answer `404` ("doesn't exist, for you"), so you don't reveal that it exists.

**Do it**
- [ ] Migration: add `user_id` to `tasks` and `projects`.
- [ ] Set `user_id` from `req.user` on create. Never take it from the request body (mass assignment again).
- [ ] Add `WHERE user_id = $1` to every read, update and delete in the repository.
- [ ] Test with two Google accounts: neither can see, edit or delete the other's tasks, even by guessing ids.

**You're done when:** the two-account test passes for every route.

---

## Stage 18: Later

Each of these is its own mini-roadmap, to break down when you get here:

- Projects routes (`/projects`)
- Subtasks and recurrence rules on the server
- Automated tests for the API
- Scheduled work sessions and the calendar
- Reading Google Calendar (read-only scope, building on Stage 16's Google sign-in)
- Deploying the server and database
