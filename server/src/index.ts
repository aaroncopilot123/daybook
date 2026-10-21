import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
    console.log("GET /health called");
    res.json({ ok: true});
});

app.listen(4000, () => {
    console.log("App listening on port 4000");
});