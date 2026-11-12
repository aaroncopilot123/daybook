# Backend Learning Log

## 2026-11-05: Stage 0
- Done: read `server/src/index.ts`, started the server, explained the `GET /tasks` request → route → JSON response flow. Stage 0 complete.
- Stuck on / next: start Stage 1 (send requests with curl, read status codes).
- Concepts that clicked: route, req/res, `req.params`, `find`, why a server keeps running (Ctrl+C to stop).
- Need revisiting: URL params are always strings (`"2"`, not `2`); `find` returns `undefined` when nothing matches (that comes back in Stage 2).

## 2026-11-05: Stage 1
- Done: opened /tasks in browser + DevTools, ran `curl -i` on /tasks/1 and /tasks/999, explained why 200 + `{}` for a missing task is wrong. Stage 1 complete.
- Stuck on / next: Stage 2, fix the 404 in `GET /tasks/:id`.
- Concepts that clicked: HTTP methods, status code families (2xx/4xx/5xx), headers vs body, `Content-Type`, reading `curl -i` output.
- Side quests (Stage 1): `304 Not Modified` + `ETag` (Express + browser caching, not Next.js; safe because the browser always revalidates); `JSON.stringify` drops `undefined` keys, so `{ data: undefined }` becomes `{}`.

## 2026-11-05: Stage 2
- Done: `GET /tasks/:id` returns 404 for a missing task (verified with curl: 999 → 404, 1 → 200). Stage 2 complete.
- Stuck on / next: move the error body to the top level, `{ "error": "Task not found" }` instead of `{ "data": { "error": ... } }`. Then Stage 3 (POST).
- Concepts that clicked: `res.status(code).json(...)` chaining; early `return` (sending a response doesn't end the function; sending twice errors).

## 2026-11-06: Stage 3
- Done: `POST /tasks` builds a full `Task` (server sets id/completed_at/created_at/updated_at/deleted_at; client fields default with `??`), responds 201. Verified in Postman: 3 tasks after POST, back to 2 after restart. Stage 3 complete. Error body is now `{ error: { message } }`. Installed dayjs (timestamps via `dayjs().toISOString()`).
- Stuck on / next: Stage 4 (validation). `req.body` can be `undefined` (wrong Content-Type, e.g. Postman form-data), which crashes with a 500; that's the first thing to handle.
- Concepts that clicked: request body, `express.json()` only parses `application/json` (Express 5 leaves `req.body` undefined otherwise), server-owned vs client-owned fields, mass assignment (never spread `req.body`), in-memory data dies on restart.
- Side quests: completing a task should be an action endpoint (`POST /tasks/:id/complete`), not the client sending `completed_at` (Stage 5). Moments (ISO UTC, shown in local time) vs days (`due_date` "YYYY-MM-DD", never converted). Decided to keep ISO strings over epoch, and `due_date` as a day (an optional `due_time` is a possible future feature).

## 2026-11-06: Stage 4
- Done: `server/src/validate-task.ts` (`validateTaskInput(body: unknown)` returns `{ ok, value | errors }`, collecting all field errors). Shape checks: body is an object, title (trimmed, non-empty), description, priority (user wrote it, using `typeof` narrowing), due_date (`isValidDay`: format + real calendar day via `Date.UTC`), project_id/parent_id (string or null), recurrence (null only, deferred). Route: 400 `{ error: { message, fields } }`; data rule for parent_id (exists, not deleted, top-level) in the route; task built only from `result.value`. User tested in Postman: all cases behave. Stage 4 complete.
- Stuck on / next: Stage 5, PATCH + DELETE (soft delete). Also planned: `POST /tasks/:id/complete` and `/reopen` instead of the client sending `completed_at`.
- Concepts that clicked: never trust the client; 400 vs 500; `unknown` vs `any`/`Task` (types are compile-time only, validation runs); `{}` in TS means "any non-nullish value"; narrowing vs `as`; validate then only use the cleaned value (never `req.body` again); shape checks vs data rules.
- Need revisiting: falsy traps (`0 &&` skips the check; compare with `!== null` explicitly). Claude wrote most of the validator and the project_id/parent_id/recurrence additions at the user's request, so it's worth re-reading `validate-task.ts` once to make sure every block makes sense.

## 2026-11-06: Roadmap reorder
- User asked whether hand-written validation is "real" (most TS backends use Zod) and wanted a shared response helper. Decided to do error handling (`HttpError` + error middleware) and Zod **before** PATCH/DELETE. Roadmap is now: Stage 5 = error handling, 5b = Zod, 6 = DELETE/PATCH/complete/reopen.

## 2026-11-06: Stage 5 (error handling)
- Done: `server/src/http-error.ts` (`HttpError(status, message, fields?)`, finished with help); an `errorHandler` (`ErrorRequestHandler`) after all routes in `index.ts`: `HttpError` → its status + `{ error: { message, fields } }`, anything else → `console.error` + 500 "Something went wrong". Tested with a temporary `throw new Error("boom")`. User converted all three hand-written error responses to `throw new HttpError(...)` and re-tested in Postman (404, empty title 400, bad parent 400). Stage 5 complete.
- Stuck on / next: Stage 5b, switch `validate-task.ts` to Zod.
- Concepts that clicked: error middleware (4 params, placed after routes), `throw` ends the function (no forgotten `return`), `instanceof`, two audiences (log the real error, send a generic 500), `JSON.stringify` dropping `undefined` fields.
- Need revisiting: classes / `extends` / `super` / `public` constructor-parameter shorthand. The user found this hard and needed the answer, so it's worth a short review later.

## 2026-11-06: Stage 5b (Zod)
- Done: installed zod 4.6.7. `validate-task.ts` is now a `TaskInput` Zod schema (Claude corrected the user's draft) plus a reusable `parseBody(schema, body)` that returns clean data or throws `HttpError(400, "Invalid task", fields)` (from `z.flattenError`, first message per field; body-level errors go under `fields.body`). `POST /tasks` validates in one line. User ran all 10 Postman cases. Stage 5b complete.
- Stuck on / next: Stage 6, DELETE (soft delete + subtasks, 204), hide deleted in GETs, PATCH with `TaskInput.partial()`, complete/reopen.
- Concepts that clicked: fields in `z.object` are required by default; `.optional()` (undefined), `.nullable()` (null) and `.default()` (fills a missing key) are different, and `.default(null)` still needs `.nullable()`; `z.date()` is a JS Date, not a JSON string (use `z.iso.date()`); `z.literal([...])` vs `z.array`; `z.infer` generates the type; custom messages via `{ error }`.
- Need revisiting: the user's first schema draft mixed these up, so a quick recap of optional/nullable/default before PATCH (where `.partial()` makes everything optional) would help.

## 2026-11-06: Stage 6 (part 1: delete)
- Done: `send(res, data, status = 200)` helper in `server/src/send.ts` (user wrote it) for all success responses, so the API has two exits: `send` → `{ data }`, throw → error handler → `{ error }`. GETs hide deleted tasks (`GET /tasks/:id` 404s on deleted). `DELETE /tasks/:id` soft-deletes the task and its live subtasks with one timestamp, 404s on missing/already deleted, and returns 200 with the deleted task (user's choice over 204). All 10 Postman steps pass.
- Stuck on / next: PATCH with `TaskInput.partial()`, then `POST /tasks/:id/complete` and `/reopen`.
- Concepts that clicked: completed (History) vs deleted (nowhere); re-DELETE → 404, idempotency; YAGNI (no deleted filter until a trash view exists); 204 has no body (Express strips it).
- Need revisiting: changing in place vs copying (`task.x = y` vs `{...task}`). The user's first DELETE changed a copy, so nothing was deleted. Also function syntax (declaration vs `const f = () => {}`), and `.map` (builds a new array) vs `.forEach` (just loops). Claude wrote the final DELETE loop.

## 2026-11-06: Stage 6 (part 2: PUT)
- Done: chose PUT over PATCH (simpler; accepted the lost-update risk across devices, and that missing fields reset to defaults). `PUT /tasks/:id`: 404 on missing/deleted, `parseBody(TaskInput)`, product rule "parent_id can't change via PUT" (user's idea; keeps subtasks one level deep), `Object.assign(taskToUpdate, sanitisedTask, { updated_at })`, returns the updated task. Claude rewrote the route after the user's draft had bugs. All 8 Postman steps pass.
- Stuck on / next: `POST /tasks/:id/complete` and `/reopen` (last Stage 6 item).
- Concepts that clicked: PUT vs PATCH and lost updates; ruling out a hard case with a product rule; `Object.assign` changes in place; Zod strips unknown keys, so copying from the parsed result is safe (unlike `req.body`).
- Need revisiting: **changing in place vs copying, for the second time**. `task = {...}` inside `.map` only rebinds the local variable. Also comparing with raw `req.body` after validation (`null !== undefined`). Worth a short exercise on references before Stage 7.

## 2026-11-10: Stage 6 (part 3: complete/reopen)
- Done: `POST /tasks/:id/complete` (idempotent; completes the task + open live subtasks with one timestamp) and `POST /tasks/:id/reopen` (idempotent; reopens subtasks whose `completed_at` matches the task's saved old time, and reopens a completed parent). Matches the frontend's `toggleTask` (minus recurrence). The user wrote both, with review rounds. Both reopen scenarios pass. **Stage 6 complete; the in-memory phase is done.**
- Stuck on / next: Stage 7 (what a database is). Open question the user raised: should these rules live in the frontend instead (see the next entry).
- Concepts that clicked: POST for actions vs PUT for idempotent replacement; idempotent actions return unchanged; changing in place done right without hints; shared timestamps as "done together" markers.
- Bugs found in review (good tracing practice): `.find` direction (parent vs children), `a || b && c` precedence, clearing a value before comparing against it (save a copy first), checking the wrong variable (`completedAt` vs `parent.completed_at`).
- User declined an extra JS-fundamentals stage; keep explaining references/copies, precedence and truthiness when they come up.

## 2026-11-10: Stage 7
- Done: concepts only. The user predicted the problems with saving to a JSON file (lost update, crash mid-write, scanning everything) and mapped `Task` onto a `tasks` table. Done check passed: the array lives in process memory and is rebuilt from the seed on every start. **Stage 7 complete.**
- Stuck on / next: Stage 8 (install Postgres, SQL by hand).
- Concepts that clicked: database = separate server on disk (Express → Postgres, like Postman → Express); `tasks.filter(...)` ≈ `SELECT ... WHERE`; NULL / `IS NULL`.
- Open for Stage 9: how to store `recurrence`. The user proposed its own table keyed by task id (a valid one-to-one design); the alternative is a `jsonb` column.

## 2026-11-11: Stage 8
- Done: installed Postgres 17 (Homebrew linked it onto PATH; no keg-only step needed), `brew services start`, `createdb daybook_dev` (fixed a `daybook_ev` typo with `dropdb`, checked with `psql -l`). In psql: CREATE TABLE with `uuid DEFAULT gen_random_uuid()`, `NOT NULL`, `DEFAULT now()`/`''`, `CHECK (priority IN (1,2,3,4))`; INSERT (defaults, uuid and CHECK rejections), SELECT, UPDATE ... RETURNING, BEGIN/ROLLBACK, DELETE, ALTER TABLE ADD COLUMN, soft delete with `now()`, WHERE/AND/IS NULL, ORDER BY (NULLs last on ASC). From-memory check passed (`practice_projects`), both practice tables dropped. **Stage 8 complete.**
- Stuck on / next: Stage 9 (design the real schema). Open questions: id generated by Express vs Postgres; recurrence as `jsonb` vs its own table.
- Concepts that clicked: psql waits for `;` (prompts `=#`, `-#`, `(#`, `*#`); backslash commands vs SQL; `''` vs NULL; no ORDER BY = no promised order; WHERE on every UPDATE/DELETE; transactions; migrations as "commits for the database".
- Need revisiting: curly smart quotes break SQL (write SQL in WebStorm); `IS NULL` only in WHERE, never in a column definition; "not deleted" = `deleted_at IS NULL` (flipped it once); `NOT NULL DEFAULT ''` quietly undoes "required"; pasting psql output back into psql.
