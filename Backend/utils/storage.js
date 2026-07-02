const fs = require("fs");
const path = require("path");

const OUTPUT_FOLDER = path.join(__dirname, "../output");
const TEMP_FOLDER = path.join(__dirname, "../temp");
const UPLOADS_FOLDER = path.join(__dirname, "../uploads");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

module.exports = { OUTPUT_FOLDER, TEMP_FOLDER, UPLOADS_FOLDER, ensureDir };
