import express from "express";
import { Task } from "@/app/lib/tasks";

const app = express();
app.use(express.json());

const tasks: Task[] = [
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
    res.json({ data: tasks});
});

app.get("/tasks/:id", (req, res) => {
    const task = tasks.find(({ id }) => id === req.params.id);
    res.json({ data: task });
});

app.listen(4000, () => {
    console.log("App listening on port 4000");
});