const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("fast-csv");
const { PassThrough } = require("stream");
const AWS = require("aws-sdk");

const {
  validateEmail,
  validatePhoneNumber,
  validateSpecialChars,
} = require("../utils/validationUtils");

const { convertToEpoch } = require("../utils/dateUtils");

const router = express.Router();

// Initialize S3
const s3 = new AWS.S3();
const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET;
const OUTPUT_BUCKET = process.env.S3_OUTPUT_BUCKET;

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

const upload = multer({
  storage: storage,
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

    // Stream file to S3 from disk
    const fileStream = fs.createReadStream(filePath);
    const uploadParams = {
      Bucket: UPLOAD_BUCKET,
      Key: fileKey,
      Body: fileStream,
      ContentType: req.file.mimetype || "text/csv",
    };

    console.log("File uploaded to S3:", { originalName });

    // Process headers and count rows via streaming
    let columns = [];
    let totalRows = 0;
    const headerMap = new Map();

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
          columns = headers;
        })
        .on("data", () => {
          totalRows++;
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Delete temporary file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      fileName: fileKey,
      columns: columns,
      totalRows: totalRows,
      hasDuplicateHeaders: Array.from(headerMap.values()).some(
        (count) => count > 1
      ),
    });
  } catch (error) {
    console.error("Error parsing CSV:", error);

    // Clean up temp file if exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "Error parsing CSV file: " + error.message });
  }
});

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

    // Stream file to S3 from disk
    const fileStream = fs.createReadStream(filePath);
    const uploadParams = {
      Bucket: UPLOAD_BUCKET,
      Key: fileKey,
      Body: fileStream,
      ContentType: req.file.mimetype || "text/csv",
    };

    await s3.upload(uploadParams).promise();

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

    // Create PassThrough streams for S3 uploads
    const logStream = new PassThrough();
    const validStream = new PassThrough();

    // Set up S3 uploads
    const logUploadPromise = s3
      .upload({
        Bucket: OUTPUT_BUCKET,
        Key: logFileName,
        Body: logStream,
        ContentType: "text/csv",
      })
      .promise();

    const validUploadPromise = s3
      .upload({
        Bucket: OUTPUT_BUCKET,
        Key: validFileName,
        Body: validStream,
        ContentType: "text/csv",
      })
      .promise();

    // Create CSV streams for formatting
    const logCsvStream = csv.format({ headers: true });
    const validCsvStream = csv.format({ headers: true });

    // Pipe the CSV streams to the PassThrough streams
    logCsvStream.pipe(logStream);
    validCsvStream.pipe(validStream);

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
            logCsvStream.write(["Row Number", ...columns, "Error Description"]);
            validCsvStream.write(columns);

            headerProcessed = true;
            resolve();
          }
        })
        .on("error", reject);
    });

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

          // Finalize the streams
          if (totalInvalidEntries === 0) {
            logCsvStream.write(["No invalid entries found", "", "", ""]);
          }
          logCsvStream.end();
          validCsvStream.end();
          resolve();
        })
        .on("error", reject);
    });

    // Wait for S3 uploads to complete
    await Promise.all([logUploadPromise, validUploadPromise]);

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
    console.error("Error processing CSV:", error);

    // Clean up temp file if exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res
      .status(500)
      .json({ error: "Error processing CSV file: " + error.message });
  }
});

module.exports = router;
