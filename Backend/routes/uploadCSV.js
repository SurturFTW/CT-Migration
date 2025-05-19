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

    const s3UploadResult = await s3.upload(uploadParams).promise();
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

    // Process the CSV data by streaming from disk
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv.parse({
            headers: (headers) => {
              return headers.map((header) => {
                if (!header) return header;
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
          logCsvStream.write(["Row Number", ...columns, "Error Description"]);
          validCsvStream.write(columns);
        })
        .on("data", (row) => {
          const errors = [];
          let rowNumber = totalInvalidEntries + validRecordCount + 1;

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
            validRecordCount++;
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

    // Wait for S3 uploads to complete
    await Promise.all([logUploadPromise, validUploadPromise]);

    // Delete temporary file
    fs.unlinkSync(filePath);

    // Return the response with error counts by type
    res.json({
      success: true,
      fileName: fileKey,
      columns: columns,
      totalRows: totalInvalidEntries + validRecordCount,
      validRecordCount: validRecordCount,
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

    try {
      // Get file data from multer
      const filePath = req.file.path;
      const originalName = req.file.originalname;
      const fileKey = `${Date.now()}-${originalName}`;

      // Stream file to S3 from disk
      const fileStream = fs.createReadStream(filePath);
      const uploadParams = {
        Bucket: UPLOAD_BUCKET,
        Key: fileKey,
        Body: fileStream,
        ContentType: req.file.mimetype || "text/csv",
      };

      await s3.upload(uploadParams).promise();

      const cleanFileName = `clean_data_${Date.now()}.csv`;

      let columns = [];
      let totalRows = 0;
      let removedRows = 0;

      // Create PassThrough stream for S3 upload
      const cleanStream = new PassThrough();

      // Set up S3 upload
      const cleanUploadPromise = s3
        .upload({
          Bucket: OUTPUT_BUCKET,
          Key: cleanFileName,
          Body: cleanStream,
          ContentType: "text/csv",
        })
        .promise();

      // Create CSV stream for formatting
      const cleanCsvStream = csv.format({ headers: true });

      // Pipe the CSV stream to the PassThrough stream
      cleanCsvStream.pipe(cleanStream);

      // Process the CSV data by streaming from disk
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
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

      // Wait for S3 upload to complete
      await cleanUploadPromise;

      // Delete temporary file
      fs.unlinkSync(filePath);

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

      // Clean up temp file if exists
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res
        .status(500)
        .json({ error: "Error cleaning CSV file: " + error.message });
    }
  }
);

module.exports = router;
