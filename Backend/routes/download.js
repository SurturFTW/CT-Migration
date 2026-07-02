const express = require("express");
const fs = require("fs");
const path = require("path");
const { OUTPUT_FOLDER } = require("../utils/storage");

const router = express.Router();

// Resolve a request-supplied path against OUTPUT_FOLDER, rejecting any
// attempt to escape it (e.g. via ".." or an encoded path separator).
function resolveSafePath(...segments) {
  const resolved = path.resolve(
    OUTPUT_FOLDER,
    ...segments.map((segment) => path.basename(segment))
  );

  if (resolved !== OUTPUT_FOLDER && !resolved.startsWith(OUTPUT_FOLDER + path.sep)) {
    return null;
  }

  return resolved;
}

function sendFile(res, filePath, downloadName) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath, downloadName, (err) => {
    if (err && !res.headersSent) {
      console.error("Error downloading file:", err);
      res.status(500).json({ error: "Error downloading file" });
    }
  });
}

router.get("/download/:filename", (req, res) => {
  const filePath = resolveSafePath(req.params.filename);
  sendFile(res, filePath, req.params.filename);
});

// Support for downloading from nested folder paths (e.g. manifest bundles)
router.get("/download/:folder/:filename", (req, res) => {
  const filePath = resolveSafePath(req.params.folder, req.params.filename);
  sendFile(res, filePath, req.params.filename);
});

module.exports = router;
