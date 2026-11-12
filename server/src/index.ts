import express, { type ErrorRequestHandler } from "express";
import dayjs from "dayjs";
import { Task } from "@/app/lib/tasks";
import { parseBody, TaskInput } from "./validate-task";
import { HttpError } from "./http-error";
import { send } from "@/server/src/send";

const app = express();
app.use(express.json());

let tasks: Task[] = [
    {
        id: "1",
        title: "First task",
        description: "",
        project_id: null,
        due_date: "2026-10-21",
        priority: 4,
        recurrence: null,
        parent_id: null,
        completed_at: null,
        created_at: "2026-10-20T09:00:00.000Z",
        updated_at: "2026-10-20T09:00:00.000Z",
        deleted_at: null,
    },
    {
        id: "2",
        title: "Second task",
        description: "Already finished",
        project_id: null,
        due_date: null,
        priority: 1,
        recurrence: null,
        parent_id: null,
        completed_at: "2026-10-21T08:30:00.000Z",
        created_at: "2026-10-19T14:00:00.000Z",
        updated_at: "2026-10-21T08:30:00.000Z",
        deleted_at: null,
    },
];

app.get("/tasks", (req, res) => {
    send(res, tasks.filter(task => !task.deleted_at));
});

app.get("/tasks/:id", (req, res) => {
    const task = tasks.find(({ id }) => id === req.params.id);
    if (!task || task.deleted_at) {
        throw new HttpError(404, "Task not found");
    }
    send(res, task);
});

app.post("/tasks", (req, res) => {
    const currentDateTime = dayjs().toISOString();

    // Shape check: throws a 400 with per-field errors if the body is wrong.
    const sanitisedTask = parseBody(TaskInput, req.body);

    // Data rule: a parent must exist, not be deleted, and be top-level (subtasks are one level deep).
    if (sanitisedTask.parent_id !== null) {
        const parent = tasks.find(({ id }) => id === sanitisedTask.parent_id);
        if (!parent || parent.deleted_at !== null || parent.parent_id !== null) {
            throw new HttpError(400, "Invalid task", { parent_id: "task with parent_id cannot be found" });
        }
    }

    const task: Task = {
        id: crypto.randomUUID(),
        title: sanitisedTask.title,
        description: sanitisedTask.description,
        project_id: sanitisedTask.project_id,
        due_date: sanitisedTask.due_date,
        priority: sanitisedTask.priority,
        recurrence: sanitisedTask.recurrence,
        parent_id: sanitisedTask.parent_id,
        completed_at: null,
        created_at: currentDateTime,
        updated_at: currentDateTime,
        deleted_at: null
    }
    tasks.push(task);
    send(res, task, 201);
})

app.put("/tasks/:id", (req, res) => {
    const taskToUpdate = tasks.find(task => task.id === req.params.id);
    if (!taskToUpdate || taskToUpdate.deleted_at) {
        throw new HttpError(404, "Task not found");
    }

    const sanitisedTask = parseBody(TaskInput, req.body);

    if (sanitisedTask.parent_id !== taskToUpdate.parent_id) {
        throw new HttpError(400, "Invalid task", { parent_id: "can't be changed" });
    }

    Object.assign(taskToUpdate, sanitisedTask, { updated_at: dayjs().toISOString() });

    send(res, taskToUpdate);
});

app.delete("/tasks/:id", (req, res) => {
    const taskToDelete = tasks.find(task => task.id === req.params.id);
    if (!taskToDelete || taskToDelete.deleted_at) {
        throw new HttpError(404, "Task not found");
    }

    const currentDate = dayjs().toISOString();

    tasks
        .filter(task => (task.id === req.params.id || task.parent_id === req.params.id) && !task.deleted_at)
        .forEach(task => {
            task.deleted_at = currentDate;
            task.updated_at = currentDate;
        });

    send(res, taskToDelete, 200);
});

app.post("/tasks/:id/complete", (req, res) => {
    const taskToComplete = tasks.find(task => task.id === req.params.id);

    if (!taskToComplete || taskToComplete.deleted_at) {
        throw new HttpError(404, "Task not found");
    }

    if (taskToComplete.completed_at) {
        send(res, taskToComplete);
        return;
    }

    const currentDateTime = dayjs().toISOString();

    tasks
        .filter(task => (task.parent_id === taskToComplete.id || task.id === taskToComplete.id) && !task.deleted_at && !task.completed_at)
        .forEach((task) => {
            task.completed_at = currentDateTime;
            task.updated_at = currentDateTime;
    })

    send(res, taskToComplete);
})

app.post("/tasks/:id/reopen", (req, res) => {
    const taskToReopen = tasks.find(task => task.id === req.params.id);

    if (!taskToReopen || taskToReopen.deleted_at) {
        throw new HttpError(404, "Task not found");
    }

    const completedAt = taskToReopen.completed_at;

    if (!completedAt) {
        send(res, taskToReopen);
        return;
    }

    const currentDateTime = dayjs().toISOString();

    tasks
        .filter(task => (task.parent_id === taskToReopen.id || task.id === taskToReopen.id) && !task.deleted_at && task.completed_at)
        .forEach((task) => {
            if (task.completed_at === completedAt) {
                task.completed_at = null;
                task.updated_at = currentDateTime;
            }
        });

    // Reopening a subtask means its parent isn't "all done" any more.
    if (taskToReopen.parent_id !== null) {
        const parent = tasks.find(task => task.id === taskToReopen.parent_id);
        if (parent && !parent.deleted_at && parent.completed_at) {
            parent.completed_at = null;
            parent.updated_at = currentDateTime;
        }
    }

    send(res, taskToReopen);
})

// Error handler: must come after every route. Express sends anything a route throws here.
// It has 4 parameters (err, req, res, next); that's how Express knows it's an error handler.
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    // Cases 1 and 2: errors we threw on purpose. They carry their own status, message and fields.
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: { message: err.message, fields: err.fields } });
        return;
    }

    // Case 3: anything else is a bug in our code.
    console.error(err);                                                     // for you: the full error in the server terminal
    res.status(500).json({ error: { message: "Something went wrong" } });   // for the client: nothing about our code
};
app.use(errorHandler);

app.listen(4000, () => {
    console.log("App listening on port 4000");
});