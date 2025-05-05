const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("fast-csv");

const {
  validateEmail,
  validatePhoneNumber,
  validateSpecialChars,
} = require("../utils/validationUtils");

const { convertToEpoch } = require("../utils/dateUtils");

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

router.post("/upload_csv", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = req.file.path;
  let columns = [];
  let totalRows = 0;

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath, { encoding: "utf-8" })
        .pipe(csv.parse({ headers: true }))
        .on("headers", (headers) => {
          columns = headers;
        })
        .on("data", () => {
          totalRows++;
        })
        .on("end", resolve)
        .on("error", reject);
    });

    res.json({
      success: true,
      fileName: req.file.originalname,
      columns: columns,
      totalRows: totalRows,
    });
  } catch (error) {
    console.error("Error parsing CSV:", error);
    res.status(500).json({ error: "Error parsing CSV file" });
  }
});

router.post("/validate_csv", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Get column mappings from request
  const identityColumn = req.body.identityColumn;
  const emailColumn = req.body.emailColumn;
  const phoneColumn = req.body.phoneColumn;

  // Validate that identity column is provided (required)
  if (!identityColumn) {
    return res.status(400).json({ error: "Identity column is required" });
  }

  const filePath = req.file.path;

  // Define output file paths
  const logFileName = `validation_log_${Date.now()}.csv`;
  const validFileName = `valid_entries_${Date.now()}.csv`;
  const logFilePath = path.join(OUTPUT_FOLDER, logFileName);
  const validFilePath = path.join(OUTPUT_FOLDER, validFileName);

  let columns = [];
  let totalInvalidEntries = 0;
  let blankIdentityCount = 0;

  // Error and conversion counters
  let errorCounts = {
    quoteErrors: 0,
    commaErrors: 0,
    newlineErrors: 0,
    controlCharErrors: 0,
    otherSpecialCharErrors: 0,
    emailErrors: 0,
    phoneErrors: 0,
    datetimeConversions: 0,
    blankIdentities: 0,
  };

  // Create write streams for the output files
  const logStream = fs.createWriteStream(logFilePath);
  const validStream = fs.createWriteStream(validFilePath);

  // Create CSV streams for formatting
  const logCsvStream = csv.format({ headers: true });
  const validCsvStream = csv.format({ headers: true });

  // Pipe the CSV streams to the file streams
  logCsvStream.pipe(logStream);
  validCsvStream.pipe(validStream);

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath, { encoding: "utf-8" })
        .pipe(csv.parse({ headers: true }))
        .on("headers", (headers) => {
          columns = headers;

          // Write headers explicitly to the validation log file
          logCsvStream.write(["Row Number", ...columns, "Error Description"]);

          // Write headers to the valid CSV file
          validCsvStream.write(columns);
        })
        .on("data", (row) => {
          const errors = [];
          let rowNumber = totalInvalidEntries + 1; // Track row number

          // Create a copy of the row for potential modifications
          const processedRow = { ...row };

          // First, check if the identity column value is blank or undefined
          if (
            !row[identityColumn] ||
            String(row[identityColumn]).trim() === ""
          ) {
            errors.push(
              `Field "${identityColumn}": Identity value is blank or missing. This field is required.`
            );
            errorCounts.blankIdentities++;
            blankIdentityCount++;
          }

          // Validate each field in the row
          Object.entries(processedRow).forEach(([key, value]) => {
            // Skip null or undefined values
            if (value === null || value === undefined) {
              return;
            }

            // Convert value to string to handle non-string values (like numbers)
            const strValue = String(value);

            // Special case for JSON values - try to parse as JSON first
            let isJsonValue = false;
            if (
              strValue.trim().startsWith("{") &&
              strValue.trim().endsWith("}")
            ) {
              try {
                JSON.parse(strValue);
                isJsonValue = true;
              } catch (e) {
                // Not valid JSON, continue with normal validation
              }
            }

            // Skip validation for valid JSON values
            if (isJsonValue) {
              return;
            }

            // Attempt datetime conversion if it's a string
            const convertedValue = convertToEpoch(strValue);
            if (convertedValue !== strValue) {
              processedRow[key] = convertedValue;
              errorCounts.datetimeConversions++;
            }

            // Validate special characters for all fields
            const specialCharIssues = validateSpecialChars(strValue);
            if (specialCharIssues) {
              errors.push(`Field "${key}": ${specialCharIssues}`);

              // Update specific error counters based on the issue
              if (specialCharIssues.includes("quote"))
                errorCounts.quoteErrors++;
              if (specialCharIssues.includes("comma"))
                errorCounts.commaErrors++;
              if (specialCharIssues.includes("newline"))
                errorCounts.newlineErrors++;
              if (specialCharIssues.includes("control"))
                errorCounts.controlCharErrors++;
              if (specialCharIssues.includes("special characters"))
                errorCounts.otherSpecialCharErrors++;
            }

            // Validate email only for the user-specified email column
            if (emailColumn && key === emailColumn) {
              const emailError = validateEmail(strValue);
              if (emailError) {
                errors.push(`Field "${key}": ${emailError}`);
                errorCounts.emailErrors++;
              }
            }

            // Validate phone only for the user-specified phone column
            if (phoneColumn && key === phoneColumn) {
              const phoneError = validatePhoneNumber(strValue);
              if (phoneError) {
                errors.push(`Field "${key}": ${phoneError}`);
                errorCounts.phoneErrors++;
              }
            }
          });

          if (errors.length > 0) {
            totalInvalidEntries++;
            // Write invalid row with error description
            const invalidRow = [
              rowNumber,
              ...Object.values(processedRow),
              errors.join("; "),
            ];
            logCsvStream.write(invalidRow);
          } else {
            // Write valid row to the valid entries file
            validCsvStream.write(processedRow);
          }
        })
        .on("end", () => {
          if (totalInvalidEntries === 0) {
            // Write a placeholder row if no invalid entries are found
            logCsvStream.write(["No invalid entries found", "", "", ""]);
          }
          logCsvStream.end();
          validCsvStream.end();
          resolve();
        })
        .on("error", reject);
    });

    // Return the response with error counts by type
    res.json({
      success: true,
      fileName: req.file.originalname,
      columns: columns,
      validationErrors:
        totalInvalidEntries > 0
          ? {
              count: totalInvalidEntries,
              logFileUrl: `/api/download/${logFileName}`,
              errorBreakdown: errorCounts,
              blankIdentityCount: blankIdentityCount,
            }
          : null,
      validEntriesUrl: `/api/download/${validFileName}`,
    });
  } catch (error) {
    console.error("Error processing CSV:", error);
    res.status(500).json({ error: "Error processing CSV file" });
  }
});

router.post(
  "/clean_blank_identities",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Get identity column name from request
    const identityColumn = req.body.identityColumn;

    if (!identityColumn) {
      return res
        .status(400)
        .json({ error: "Identity column name is required" });
    }

    const filePath = req.file.path;
    const cleanFileName = `clean_data_${Date.now()}.csv`;
    const cleanFilePath = path.join(OUTPUT_FOLDER, cleanFileName);

    let columns = [];
    let totalRows = 0;
    let removedRows = 0;

    // Create output streams
    const cleanStream = fs.createWriteStream(cleanFilePath);
    const cleanCsvStream = csv.format({ headers: true });
    cleanCsvStream.pipe(cleanStream);

    try {
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath, { encoding: "utf-8" })
          .pipe(csv.parse({ headers: true }))
          .on("headers", (headers) => {
            columns = headers;
            cleanCsvStream.write(columns);
          })
          .on("data", (row) => {
            totalRows++;

            // Check if the identity column has a value
            if (
              row[identityColumn] &&
              String(row[identityColumn]).trim() !== ""
            ) {
              cleanCsvStream.write(row);
            } else {
              removedRows++;
            }
          })
          .on("end", () => {
            cleanCsvStream.end();
            resolve();
          })
          .on("error", reject);
      });

      res.json({
        success: true,
        fileName: cleanFileName,
        originalRows: totalRows,
        removedRows: removedRows,
        remainingRows: totalRows - removedRows,
        cleanFileUrl: `/api/download/${cleanFileName}`,
      });
    } catch (error) {
      console.error("Error cleaning CSV:", error);
      res.status(500).json({ error: "Error cleaning CSV file" });
    }
  }
);

module.exports = router;
