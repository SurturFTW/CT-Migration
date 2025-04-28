const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("fast-csv");
const { stringify } = require("csv-stringify");
const { CsvSpecialCharFixerTransform } = require("../utils/csvUtils");

const router = express.Router();

const UPLOAD_FOLDER = path.join(__dirname, "../uploads");
const OUTPUT_FOLDER = path.join(__dirname, "../output");

const storage = multer.diskStorage({
  destination: UPLOAD_FOLDER,
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

router.post("/fix_errors", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = req.file.path;
  const fixedFileName = `fixed_entries_${Date.now()}.csv`;
  const fixedFilePath = path.join(OUTPUT_FOLDER, fixedFileName);

  // Get column mappings if provided
  const columnMappings = req.body.columnMappings
    ? JSON.parse(req.body.columnMappings)
    : null;

  // Create the output stream with csv-stringify
  const writeStream = fs.createWriteStream(fixedFilePath);

  // Only quote values when necessary
  const stringifier = stringify({
    header: true,
    quoted: false,
    quoted_empty: false,
    quoted_string: false,
  });

  stringifier.pipe(writeStream);

  let totalRowCount = 0;
  const fixerTransform = new CsvSpecialCharFixerTransform(columnMappings);
  const startTime = Date.now();

  try {
    // Process the file
    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true }))
      .pipe(fixerTransform)
      .on("data", (row) => {
        totalRowCount++;
        stringifier.write(row);
      })
      .on("end", () => {
        stringifier.end();

        // Return the download URL for the fixed file and detailed stats
        res.json({
          success: true,
          fixedFileUrl: `/api/download/${fixedFileName}`,
          message: `Processed ${totalRowCount} rows and fixed ${fixerTransform.fixedRowsCount} rows.`,
          fixDetails: {
            quotes: fixerTransform.fixCounts.quotes,
            commas: fixerTransform.fixCounts.commas,
            newlines: fixerTransform.fixCounts.newlines,
            controlChars: fixerTransform.fixCounts.controlChars,
            other: fixerTransform.fixCounts.other,
            datetimeConversions: fixerTransform.fixCounts.datetimeConversions,
          },
        });
      })
      .on("error", (error) => {
        console.error("Error fixing CSV:", error);
        res.status(500).json({ error: "Error fixing CSV file" });
      });
  } catch (error) {
    console.error("Error fixing CSV:", error);
    res.status(500).json({ error: "Error fixing CSV file" });
  }
});

module.exports = router;
