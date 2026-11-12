import type { Response } from "express";

// The one place that decides what a successful response looks like: `{ data: ... }`.
// Errors have their own one place: the error handler in index.ts.
// Usage: send(res, task)  →  200 { data: task }
//        send(res, task, 201)  →  201 { data: task }
export function send(res: Response, data: unknown, status = 200) {
    res.status(status).json({ data });
}
