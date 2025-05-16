const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const cors = require("cors");
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});

const s3 = new AWS.S3();

// S3 bucket configuration - these will be read from environment variables
const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET;
const OUTPUT_BUCKET = process.env.S3_OUTPUT_BUCKET;

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Set up direct S3 storage for uploads - streaming directly to S3
const s3Storage = multerS3({
  s3: s3,
  bucket: UPLOAD_BUCKET,
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname });
  },
  key: function (req, file, cb) {
    // Use original filename, or generate unique name if needed
    cb(null, file.originalname);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically detect content type
});

// Configure multer with S3 storage
const upload = multer({ storage: s3Storage });

// app.use("/downloads", express.static(OUTPUT_FOLDER));

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
});
