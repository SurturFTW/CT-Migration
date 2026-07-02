const fs = require("fs");
const path = require("path");
const os = require("os");
const { OUTPUT_FOLDER, TEMP_FOLDER, UPLOADS_FOLDER } = require("./storage");

// How long a file/folder can sit in a temp/output directory before the sweep removes it.
const RETENTION_MS =
  (Number(process.env.FILE_RETENTION_HOURS) || 24) * 60 * 60 * 1000;

const SWEEP_DIRS = [
  OUTPUT_FOLDER,
  TEMP_FOLDER,
  UPLOADS_FOLDER,
  path.join(os.tmpdir(), "clevertap_uploads"),
];

function sweepDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    const stats = fs.statSync(entryPath);

    if (stats.isDirectory()) {
      sweepDir(entryPath);
      if (
        fs.readdirSync(entryPath).length === 0 &&
        Date.now() - stats.mtimeMs > RETENTION_MS
      ) {
        fs.rmdirSync(entryPath);
      }
      continue;
    }

    if (Date.now() - stats.mtimeMs > RETENTION_MS) {
      fs.unlinkSync(entryPath);
    }
  }
}

function runCleanupSweep() {
  for (const dir of SWEEP_DIRS) {
    try {
      sweepDir(dir);
    } catch (err) {
      console.error(`Cleanup sweep failed for ${dir}:`, err.message);
    }
  }
}

function startCleanupSweep(intervalMs = 60 * 60 * 1000) {
  runCleanupSweep();
  setInterval(runCleanupSweep, intervalMs);
}

module.exports = { startCleanupSweep, runCleanupSweep };
