import { z } from "zod";
import { HttpError } from "./http-error";

// What a client may send when creating a task: the rules AND the defaults, in one place.
export const TaskInput = z.object({
    title: z.string().trim().min(1),                              // required, trimmed, not empty
    description: z.string().default(""),                          // optional, defaults to ""
    priority: z.literal([1, 2, 3, 4], { error: "must be 1, 2, 3, 4 or null" }).nullable().default(null),   // one of 1–4, or null
    due_date: z.iso.date().nullable().default(null),              // a real YYYY-MM-DD day, or null
    project_id: z.string().nullable().default(null),              // existence is checked later
    parent_id: z.string().nullable().default(null),               // existence is checked in the route
    recurrence: z.null().default(null),                           // recurring tasks are deferred
});

// The TypeScript type, generated from the schema, so the two can never disagree.
export type TaskInput = z.infer<typeof TaskInput>;

// Check `body` against a schema. Returns the clean values, or throws a 400 that the error handler formats.
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
    const result = schema.safeParse(body);
    if (result.success) return result.data;

    // Zod lists errors per field as arrays of messages; keep the first message for each field.
    const { formErrors, fieldErrors } = z.flattenError(result.error);
    const fields: Record<string, string> = {};
    for (const [field, messages] of Object.entries(fieldErrors) as [string, string[] | undefined][]) {
        if (messages?.[0]) fields[field] = messages[0];
    }
    // formErrors are about the body as a whole, e.g. "expected object, received undefined".
    if (formErrors[0]) fields.body = formErrors[0];

    throw new HttpError(400, "Invalid task", fields);
}
