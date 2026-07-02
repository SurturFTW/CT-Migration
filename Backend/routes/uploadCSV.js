const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("fast-csv");
const XLSX = require("xlsx");

const {
  validateEmail,
  validatePhoneNumber,
  validateSpecialChars,
} = require("../utils/validationUtils");

const { convertToEpoch } = require("../utils/dateUtils");
const { OUTPUT_FOLDER, ensureDir } = require("../utils/storage");

const router = express.Router();

ensureDir(OUTPUT_FOLDER);

// Configure multer to use disk storage for large files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, "../temp");
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept CSV and Excel files
  const allowedTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (
    allowedTypes.includes(file.mimetype) ||
    file.originalname.endsWith(".csv") ||
    file.originalname.endsWith(".xls") ||
    file.originalname.endsWith(".xlsx")
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV and Excel files are allowed"));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB limit
});

// Fixed chunk size
const CHUNK_SIZE = 50000;

router.post("/upload_csv", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Get file data from multer
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileKey = originalName;

    // Process the file to get headers and count rows
    const fileInfo = await processFileHeaders(filePath, originalName);

    // Delete temporary file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      fileName: fileKey,
      columns: fileInfo.columns,
      totalRows: fileInfo.totalRows,
      hasDuplicateHeaders: fileInfo.hasDuplicateHeaders,
    });
  } catch (error) {
    console.error("Error parsing file:", error);

    // Clean up temp file if exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "Error parsing file: " + error.message });
  }
});

// Helper function to identify file type and process it accordingly
async function processFileHeaders(filePath, fileName) {
  const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
  const columns = [];
  let totalRows = 0;
  const headerMap = new Map();

  if (isExcel) {
    // Process Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length > 0) {
      // Process headers (first row)
      const headers = data[0];
      headers.forEach((header) => {
        if (!header) return; // Skip empty headers
        const count = headerMap.get(header) || 0;
        headerMap.set(header, count + 1);
        columns.push(count > 0 ? `${header}_${count}` : header);
      });

      // Count rows (excluding header)
      totalRows = data.length - 1;
    }
  } else {
    // Process CSV (existing code)
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv.parse({
            headers: (headers) => {
              return headers.map((header) => {
                if (!header) return header; // Skip empty headers
                const count = headerMap.get(header) || 0;
                headerMap.set(header, count + 1);
                return count > 0 ? `${header}_${count}` : header;
              });
            },
            renameHeaders: true,
          })
        )
        .on("headers", (headers) => {
          columns.push(...headers);
        })
        .on("data", () => {
          totalRows++;
        })
        .on("end", resolve)
        .on("error", reject);
    });
  }

  return {
    columns,
    totalRows,
    hasDuplicateHeaders: Array.from(headerMap.values()).some(
      (count) => count > 1
    ),
  };
}

// Similarly update the validate_csv route to handle Excel files
// Note: You'll need to implement an Excel version of your processing logic
router.post("/validate_csv", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const identityColumn = req.body.identityColumn;
  const emailColumn = req.body.emailColumn;
  const phoneColumn = req.body.phoneColumn;
  const startTime = Date.now();

  if (!identityColumn) {
    return res.status(400).json({ error: "Identity column is required" });
  }

  try {
    // Get file data from multer
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileKey = originalName;
    const isExcel =
      originalName.endsWith(".xlsx") || originalName.endsWith(".xls");

    // Generate output filenames
    const logFileName = `validation_log_${Date.now()}_${originalName}`;
    const validFileName = `valid_entries_${Date.now()}_${originalName}`;

    let columns = [];
    let totalInvalidEntries = 0;
    let validRecordCount = 0;
    let blankIdentityCount = 0;
    const headerMap = new Map();

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

    // Create local write streams for the output files
    const logStream = fs.createWriteStream(
      path.join(OUTPUT_FOLDER, logFileName)
    );
    const validStream = fs.createWriteStream(
      path.join(OUTPUT_FOLDER, validFileName)
    );

    const logWritePromise = new Promise((resolve, reject) => {
      logStream.on("finish", resolve);
      logStream.on("error", reject);
    });

    const validWritePromise = new Promise((resolve, reject) => {
      validStream.on("finish", resolve);
      validStream.on("error", reject);
    });

    // Create CSV streams for formatting
    const logCsvStream = csv.format({ headers: true });
    const validCsvStream = csv.format({ headers: true });

    // Pipe the CSV streams to the local output files
    logCsvStream.pipe(logStream);
    validCsvStream.pipe(validStream);

    // Simple function to process a chunk of rows
    const processChunk = (rows, startIndex) => {
      const valid = [];
      const invalid = [];
      let chunkValidCount = 0;
      let chunkInvalidCount = 0;
      let chunkBlankIdentityCount = 0;

      const chunkErrorCounts = {
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

      for (let i = 0; i < rows.length; i++) {
        const rowArray = rows[i];
        const rowNumber = startIndex + i + 1; // +1 to account for header

        // Convert array to object using column names
        const row = {};
        columns.forEach((col, idx) => {
          row[col] = rowArray[idx] !== undefined ? rowArray[idx] : null;
        });

        const errors = [];
        const processedRow = { ...row };

        // Check if the identity column value is blank or undefined
        const identityValue = row[identityColumn];
        if (
          !identityValue ||
          String(identityValue).trim() === "" ||
          String(identityValue).toLowerCase().trim() === "null" ||
          String(identityValue).trim() === "0" ||
          Number(identityValue) === 0
        ) {
          errors.push(
            `Field "${identityColumn}": Identity value is blank, missing, null, or zero. This field is required and must have a valid value.`
          );
          chunkErrorCounts.blankIdentities++;
          chunkBlankIdentityCount++;
        }

        // Validate each field in the row
        Object.entries(processedRow).forEach(([key, value]) => {
          // Skip null or undefined values
          if (value === null || value === undefined) {
            return;
          }

          // Convert value to string
          const strValue = String(value);

          // Special case for JSON values
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

          if (isJsonValue) return;

          // Attempt datetime conversion
          const convertedValue = convertToEpoch(strValue);
          if (convertedValue !== strValue) {
            processedRow[key] = convertedValue;
            chunkErrorCounts.datetimeConversions++;
          }

          // Validate special characters
          const specialCharIssues = validateSpecialChars(strValue);
          if (specialCharIssues) {
            errors.push(`Field "${key}": ${specialCharIssues}`);

            if (specialCharIssues.includes("quote"))
              chunkErrorCounts.quoteErrors++;
            if (specialCharIssues.includes("comma"))
              chunkErrorCounts.commaErrors++;
            if (specialCharIssues.includes("newline"))
              chunkErrorCounts.newlineErrors++;
            if (specialCharIssues.includes("control"))
              chunkErrorCounts.controlCharErrors++;
            if (specialCharIssues.includes("special characters"))
              chunkErrorCounts.otherSpecialCharErrors++;
          }

          // Validate email
          if (emailColumn && key === emailColumn) {
            const emailError = validateEmail(strValue);
            if (emailError) {
              errors.push(`Field "${key}": ${emailError}`);
              chunkErrorCounts.emailErrors++;
            }
          }

          // Validate phone
          if (phoneColumn && key === phoneColumn) {
            const phoneError = validatePhoneNumber(strValue);
            if (phoneError) {
              errors.push(`Field "${key}": ${phoneError}`);
              chunkErrorCounts.phoneErrors++;
            }
          }
        });

        if (errors.length > 0) {
          chunkInvalidCount++;
          invalid.push({
            rowNumber,
            row: processedRow,
            errors: errors.join("; "),
          });
        } else {
          chunkValidCount++;
          valid.push(processedRow);
        }
      }

      // Update global counters
      validRecordCount += chunkValidCount;
      totalInvalidEntries += chunkInvalidCount;
      blankIdentityCount += chunkBlankIdentityCount;

      // Update global error counts
      Object.keys(chunkErrorCounts).forEach((key) => {
        errorCounts[key] += chunkErrorCounts[key];
      });

      // Write results to streams
      valid.forEach((row) => {
        validCsvStream.write(row);
      });

      invalid.forEach(({ rowNumber, row, errors }) => {
        const rowArray = columns.map((col) => row[col]);
        logCsvStream.write([rowNumber, ...rowArray, errors]);
      });
    };

    // Process file differently based on type
    if (isExcel) {
      // Process Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (data.length > 0) {
        // First row contains headers
        const headers = data[0];
        columns = headers.map((header, index) => {
          if (!header) return `Column_${index}`;
          const count = headerMap.get(header) || 0;
          headerMap.set(header, count + 1);
          return count > 0 ? `${header}_${count}` : header;
        });

        // Write headers to output streams
        logCsvStream.write(["Row Number", ...columns, "Error Description"]);
        validCsvStream.write(columns);

        // Process data in chunks
        const rows = data.slice(1); // Skip header
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          processChunk(chunk, i);
        }
      }
    } else {
      // Process CSV file - existing logic
      // First, read and extract headers
      await new Promise((resolve, reject) => {
        let headerProcessed = false;

        fs.createReadStream(filePath)
          .pipe(csv.parse())
          .on("data", (row) => {
            if (!headerProcessed) {
              columns = row.map((header, index) => {
                if (!header) return `Column_${index}`;
                const count = headerMap.get(header) || 0;
                headerMap.set(header, count + 1);
                return count > 0 ? `${header}_${count}` : header;
              });

              // Write headers to output streams
              logCsvStream.write([
                "Row Number",
                ...columns,
                "Error Description",
              ]);
              validCsvStream.write(columns);

              headerProcessed = true;
              resolve();
            }
          })
          .on("error", reject);
      });

      // Read and process the CSV in non-concurrent chunks
      await new Promise((resolve, reject) => {
        let isFirstRow = true;
        let currentChunk = [];
        let rowIndex = 0;

        fs.createReadStream(filePath)
          .pipe(csv.parse())
          .on("data", (row) => {
            // Skip header row
            if (isFirstRow) {
              isFirstRow = false;
              return;
            }

            currentChunk.push(row);

            if (currentChunk.length >= CHUNK_SIZE) {
              // Process the chunk immediately
              processChunk(currentChunk, rowIndex);
              rowIndex += currentChunk.length;
              currentChunk = [];
            }
          })
          .on("end", () => {
            // Process any remaining rows
            if (currentChunk.length > 0) {
              processChunk(currentChunk, rowIndex);
            }
            resolve();
          })
          .on("error", reject);
      });
    }

    // Finalize the streams
    if (totalInvalidEntries === 0) {
      logCsvStream.write(["No invalid entries found", "", "", ""]);
    }
    logCsvStream.end();
    validCsvStream.end();

    // Wait for the output files to finish writing to disk
    await Promise.all([logWritePromise, validWritePromise]);

    // Delete temporary file
    fs.unlinkSync(filePath);

    const processingTime = (Date.now() - startTime) / 1000;

    // Return the response
    res.json({
      success: true,
      fileName: fileKey,
      columns: columns,
      totalRows: totalInvalidEntries + validRecordCount,
      validRecordCount: validRecordCount,
      processingTimeSeconds: processingTime,
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
    console.error("Error processing file:", error);

    // Clean up temp file if exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "Error processing file: " + error.message });
  }
});

module.exports = router;
