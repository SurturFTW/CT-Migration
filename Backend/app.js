const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { startCleanupSweep } = require("./utils/cleanup");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Default route for the root URL
app.get("/", (req, res) => {
  res.send("Welcome to the CSV Processing Server!");
});

// Import routes
app.use("/api", require("./routes/manifest"));
app.use("/api", require("./routes/fixError"));
app.use("/api", require("./routes/download"));
app.use("/api", require("./routes/uploadCSV"));
app.use("/api", require("./routes/uploadEvent"));
app.use("/api", require("./routes/json-converter"));
app.use("/api", require("./routes/handleS3"));

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something broke!",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startCleanupSweep();
});
