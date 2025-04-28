const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const OUTPUT_FOLDER = path.join(__dirname, "../output");

router.get("/download/:filename", (req, res) => {
  const filePath = path.join(OUTPUT_FOLDER, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
    // console.log("Attempting to download:", filePath);
    // console.log("File exists:", fs.existsSync(filePath));
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Support for downloaded nested folder paths
router.get("/download/:folder/:filename", (req, res) => {
  const filePath = path.join(
    global.OUTPUT_FOLDER,
    req.params.folder,
    req.params.filename
  );
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

module.exports = router;
