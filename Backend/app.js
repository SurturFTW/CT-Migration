const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Upload and Output folders
const UPLOAD_FOLDER = path.join(__dirname, "uploads");
const OUTPUT_FOLDER = path.join(__dirname, "output");

// Ensure folders exist
fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Serve static files from the "public" folder
// app.use(express.static("public"));

// Set up file storage for uploads
const storage = multer.diskStorage({
  destination: UPLOAD_FOLDER,
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

app.use("/downloads", express.static(OUTPUT_FOLDER));

// Default route for the root URL
app.get("/", (req, res) => {
  res.send("Welcome to the CSV Processing Server!");
});

app.use("/api", require("./routes/manifest"));
app.use("/api", require("./routes/fixError"));
app.use("/api", require("./routes/download"));
app.use("/api", require("./routes/uploadCSV"));
app.use("/api", require("./routes/uploadEvent"));
app.use("/api", require("./routes/json-converter"));

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
});
