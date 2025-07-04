const express = require("express");
const multer = require("multer");
const path = require("path");
const csv = require("fast-csv");
const axios = require("axios");
const AWS = require("aws-sdk");
const fs = require("fs");
const os = require("os");
const router = express.Router();

// Initialize S3
const s3 = new AWS.S3();
const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET;

// Configure multer for large files - using disk storage for very large files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(os.tmpdir(), "clevertap_uploads");

    // Create directory if doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`);
  },
});

// Use disk storage for large files
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB limit
});

// === CONFIGURATION === (like Python script)
const BATCH_SIZE = 950;
const MAX_CONCURRENT = 10;
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 2;

// Helper function to delay execution (like Python's time.sleep)
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Create chunk_events function (like Python script)
function chunkEvents(events, size = BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < events.length; i += size) {
    chunks.push(events.slice(i, Math.min(i + size, events.length)));
  }
  return chunks;
}

// Create a failed batches log file
const createFailedBatchesLogFile = (accountId) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `failed_batches_${accountId}_${timestamp}.json`;
  const filePath = path.join(os.tmpdir(), fileName);

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        accountId,
        timestamp: new Date().toISOString(),
        failedBatches: [],
      },
      null,
      2
    )
  );

  return filePath;
};

// Log failed batch information
const logFailedBatch = (logFilePath, batchIndex, events, error) => {
  try {
    const logData = JSON.parse(fs.readFileSync(logFilePath, "utf8"));

    logData.failedBatches.push({
      batchIndex,
      timestamp: new Date().toISOString(),
      eventsCount: events.length,
      error: {
        message: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      },
      // Store sample event
      sampleEvent: events.length > 0 ? events[0] : null,
    });

    fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));
    console.log(`📝 Failed batch ${batchIndex} logged to: ${logFilePath}`);
  } catch (logError) {
    console.error("❌ Failed to log failed batch:", logError);
  }
};

// Upload batch with retry logic (like Python script)
async function uploadBatch(
  batch,
  batchIndex,
  uploadUrl,
  requestHeaders,
  failedBatchesLogPath
) {
  const payload = { d: batch };

  console.log(`📦 Preparing batch ${batchIndex}, size: ${batch.length} events`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `🚀 Sending batch ${batchIndex} (attempt ${attempt}/${MAX_RETRIES}) with ${batch.length} events to ${uploadUrl}`
      );

      const startTime = Date.now();
      const response = await axios.post(uploadUrl, payload, {
        headers: requestHeaders,
        timeout: 30000, // 30 second timeout
      });
      const duration = Date.now() - startTime;

      console.log(
        `✅ Batch ${batchIndex} uploaded successfully in ${duration}ms (status ${response.status})`
      );
      console.log(`Response: ${JSON.stringify(response.data)}`);

      return {
        batchIndex,
        status: 200,
        message: "OK",
        data: response.data,
        duration,
        success: true,
      };
    } catch (error) {
      const isRetryableError =
        error.response?.status === 429 || // Rate limit
        error.response?.status >= 500 || // Server errors
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT";

      if (attempt < MAX_RETRIES && isRetryableError) {
        // Exponential backoff with jitter (exactly like Python script)
        const waitTime = (RETRY_DELAY_BASE ** attempt + Math.random()) * 1000;
        console.log(
          `⏳ Retry ${attempt} for batch ${batchIndex} (status ${
            error.response?.status || "network error"
          }) - waiting ${Math.round(waitTime)}ms`
        );
        await sleep(waitTime);
      } else {
        // Final failure - log like Python script
        console.error(
          `❌ Batch ${batchIndex} failed after ${attempt} attempts:`,
          error.response?.data || error.message
        );

        // Log the failed batch
        if (failedBatchesLogPath) {
          logFailedBatch(failedBatchesLogPath, batchIndex, batch, error);
        }

        return {
          batchIndex,
          status: error.response?.status || 0,
          message:
            error.response?.data ||
            `Failed after ${attempt} retries: ${error.message}`,
          success: false,
        };
      }
    }
  }

  // If we get here, all retries failed
  console.error(
    `❌ Batch ${batchIndex} completely failed after ${MAX_RETRIES} attempts`
  );
  return {
    batchIndex,
    status: 0,
    message: `Failed after ${MAX_RETRIES} retries`,
    success: false,
  };
}

// Upload events (following Python script structure)
async function uploadEvents(
  events,
  uploadUrl,
  requestHeaders,
  failedBatchesLogPath
) {
  // Split events into batches (like Python script)
  const batches = chunkEvents(events, BATCH_SIZE);

  console.log(
    `📊 Processing ${events.length} events in ${batches.length} batches with concurrency ${MAX_CONCURRENT}`
  );

  // Track results
  const results = {
    totalEvents: events.length,
    batches: batches.length,
    successfulBatches: 0,
    failedBatches: 0,
    batchResults: [],
  };

  // Process batches with ThreadPoolExecutor-like pattern
  const processBatches = async () => {
    let activeTasks = 0;
    let completedTasks = 0;
    const allTasks = [];

    // Process a single batch
    const processBatch = async (batch, index) => {
      activeTasks++;
      const result = await uploadBatch(
        batch,
        index,
        uploadUrl,
        requestHeaders,
        failedBatchesLogPath
      );
      activeTasks--;
      completedTasks++;

      // Update stats
      if (result.success) {
        results.successfulBatches++;
      } else {
        results.failedBatches++;
      }

      results.batchResults.push(result);

      // Show progress
      console.log(
        `⏱️ Progress: ${completedTasks}/${
          batches.length
        } batches processed (${Math.round(
          (completedTasks / batches.length) * 100
        )}%)`
      );

      return result;
    };

    // Start initial batch of tasks
    const pendingTasks = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT, batches.length); i++) {
      const task = processBatch(batches[i], i);
      pendingTasks.push(task);
      allTasks.push(task);
    }

    // Process remaining batches as tasks complete
    for (let i = MAX_CONCURRENT; i < batches.length; i++) {
      // Wait for a task to complete
      await Promise.race(pendingTasks);

      // Remove completed tasks
      const filteredTasks = pendingTasks.filter((t) => !t.isCompleted);
      pendingTasks.length = 0;
      pendingTasks.push(...filteredTasks);

      // Start a new task
      const task = processBatch(batches[i], i);
      pendingTasks.push(task);
      allTasks.push(task);
    }

    // Wait for all remaining tasks
    await Promise.all(pendingTasks);
  };

  await processBatches();

  return results;
}

// Route handler for event upload
router.post("/upload_event", upload.single("file"), async (req, res) => {
  // Track file for cleanup
  const uploadedFilePath = req.file ? req.file.path : null;
  let failedBatchesLogPath = null;
  const startTime = Date.now();

  try {
    console.log(
      `🔄 Processing upload request for file: ${req.file.originalname}`
    );

    const {
      accountId,
      passcode,
      apiUrl,
      mapping,
      itemsFields,
      groupByField,
      specialFields,
    } = req.body;

    // Parse request data
    const parsedMapping = JSON.parse(mapping);
    const parsedItemsFields = JSON.parse(itemsFields || "[]");
    const parsedSpecialFields = JSON.parse(specialFields || "{}");
    const parsedHeaders = req.body.headers
      ? JSON.parse(req.body.headers)
      : null;

    // Event name is always "Charged" unless specified in special fields
    const evtName = parsedSpecialFields.eventName || "Charged";

    if (!accountId || !passcode || !req.file || !groupByField) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // Create failed batches log file
    failedBatchesLogPath = createFailedBatchesLogFile(accountId);
    console.log(`📄 Created log file at: ${failedBatchesLogPath}`);

    // Determine the API URL
    const uploadUrl = apiUrl || "https://api.clevertap.com/1/upload";

    // Configure headers for CleverTap API
    const requestHeaders = parsedHeaders || {
      "X-CleverTap-Account-Id": accountId,
      "X-CleverTap-Passcode": passcode,
      "Content-Type": "application/json",
    };

    // Process CSV and extract events
    console.log(`📊 Processing CSV file: ${req.file.originalname}`);
    const events = await processCSVFile(
      req.file.path,
      parsedMapping,
      parsedItemsFields,
      parsedSpecialFields,
      groupByField,
      evtName
    );

    console.log(`🎯 CSV processed: ${events.length} events extracted`);

    // Upload events with Python-style concurrency
    const uploadResults = await uploadEvents(
      events,
      uploadUrl,
      requestHeaders,
      failedBatchesLogPath
    );

    // Upload failed batches log to S3 if there were failures
    let failedBatchesLogUrl = null;
    if (uploadResults.failedBatches > 0) {
      failedBatchesLogUrl = await uploadFailedBatchesLogToS3(
        failedBatchesLogPath,
        accountId
      );
    }

    // Calculate total time
    const totalTime = Math.round((Date.now() - startTime) / 1000);

    // Add additional info to results
    uploadResults.failedBatchesLogUrl = failedBatchesLogUrl;
    uploadResults.originalFileName = req.file.originalname;
    uploadResults.processingTime = `${totalTime} seconds`;

    // Final summary
    console.log(
      `✨ Upload completed in ${totalTime}s: ${uploadResults.successfulBatches}/${uploadResults.batches} batches successful`
    );

    res.json(uploadResults);
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      error: `Failed to process events: ${error.message}`,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    // Clean up the temporary files
    cleanupFiles(uploadedFilePath, failedBatchesLogPath);
  }
});

// Helper function to normalize grouping value to fix group by issues
function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  // Convert to string and normalize whitespace
  return String(value).trim().toLowerCase();
}

// Helper function to process CSV and extract events
async function processCSVFile(
  filePath,
  mapping,
  itemsFields,
  specialFields,
  groupByField,
  evtName
) {
  return new Promise((resolve, reject) => {
    const transactionMap = new Map();
    const uniqueIdentities = new Set();
    let totalRows = 0;
    let totalEvents = 0;
    let skippedRows = 0;

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true }))
      .on("data", (row) => {
        totalRows++;

        try {
          // Extract identity field
          let identity = null;
          if (specialFields.identityField && row[specialFields.identityField]) {
            identity = row[specialFields.identityField];
          }

          if (!identity) {
            skippedRows++;
            return; // Skip rows without identity
          }

          // Normalize identity
          identity = normalizeValue(identity);

          // Extract timestamp
          let timestamp = Math.floor(Date.now() / 1000); // Default to current time
          if (
            specialFields.timestampField &&
            row[specialFields.timestampField]
          ) {
            // Parse timestamp based on type
            const rawTimestamp = row[specialFields.timestampField];
            if (specialFields.timestampFieldType === "integer") {
              timestamp = parseInt(rawTimestamp);
              if (timestamp > 10000000000) {
                // Likely milliseconds
                timestamp = Math.floor(timestamp / 1000);
              }
            } else {
              // Try to parse as date
              try {
                timestamp = Math.floor(new Date(rawTimestamp).getTime() / 1000);
              } catch (e) {
                console.warn(
                  `Invalid timestamp format: ${rawTimestamp}, using current time`
                );
              }
            }
          }

          // Extract group by field - NORMALIZE it to fix grouping issues
          let groupFieldValue = "";
          if (row[groupByField]) {
            groupFieldValue = normalizeValue(row[groupByField]);
          }

          // Create event object
          const eventObj = {
            type: "event",
            evtName: evtName,
            ts: timestamp,
          };

          // Set identity
          if (identity) {
            eventObj[specialFields.identityFieldMapping || "identity"] =
              identity;
            uniqueIdentities.add(identity);
          }

          // Process event properties
          const evtData = {};
          for (const [csvField, ctField] of Object.entries(mapping)) {
            if (
              row[csvField] !== undefined &&
              row[csvField] !== null &&
              row[csvField] !== ""
            ) {
              evtData[ctField] = row[csvField];
            }
          }

          // Set event data
          if (Object.keys(evtData).length > 0) {
            eventObj.evtData = evtData;
          }

          // Create a composite key with normalized values
          const compositeKey = `${identity}|${timestamp}|${groupFieldValue}`;

          // Store in transaction map
          if (!transactionMap.has(compositeKey)) {
            transactionMap.set(compositeKey, eventObj);
            totalEvents++;
          }

          // Process items
          if (itemsFields && itemsFields.length > 0) {
            processItemsFields(
              row,
              itemsFields,
              transactionMap.get(compositeKey)
            );
          }
        } catch (err) {
          skippedRows++;
          console.warn(`Skipped row ${totalRows} due to error: ${err.message}`);
        }
      })
      .on("end", () => {
        const events = Array.from(transactionMap.values());
        console.log(
          `CSV processing complete: ${totalRows} rows -> ${events.length} events (${skippedRows} rows skipped, ${uniqueIdentities.size} unique identities)`
        );
        resolve(events);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

// Helper function to process items fields
function processItemsFields(row, itemsFields, eventObj) {
  if (!itemsFields || itemsFields.length === 0) return;

  // Ensure evtData exists
  if (!eventObj.evtData) {
    eventObj.evtData = {};
  }

  // Process items fields (if not already done)
  if (!eventObj.evtData.Items) {
    eventObj.evtData.Items = [];
  }

  // Create new item
  const item = {};

  // Extract item fields
  for (const itemField of itemsFields) {
    const fieldName = itemField.fieldName;
    const ctField = itemField.ctFieldName || fieldName;

    if (
      row[fieldName] !== undefined &&
      row[fieldName] !== null &&
      row[fieldName] !== ""
    ) {
      // Convert numeric values
      if (itemField.fieldType === "number") {
        try {
          item[ctField] = parseFloat(row[fieldName]);
        } catch (e) {
          item[ctField] = row[fieldName];
        }
      } else {
        item[ctField] = row[fieldName];
      }
    }
  }

  // Only add non-empty items
  if (Object.keys(item).length > 0) {
    eventObj.evtData.Items.push(item);
  }
}

// Helper function to handle file cleanup
function cleanupFiles(uploadedFilePath, failedBatchesLogPath) {
  // Clean up the temporary files
  if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
    try {
      fs.unlinkSync(uploadedFilePath);
      console.log(`🧹 Cleaned up uploaded file: ${uploadedFilePath}`);
    } catch (err) {
      console.error("❌ Failed to clean up uploaded file:", err);
    }
  }

  // Keep the failed batches log if it has content
  if (failedBatchesLogPath && fs.existsSync(failedBatchesLogPath)) {
    const stats = fs.statSync(failedBatchesLogPath);
    if (stats.size <= 100) {
      // Only basic structure, no actual failures
      try {
        fs.unlinkSync(failedBatchesLogPath);
        console.log(
          `🧹 Cleaned up empty failed batches log: ${failedBatchesLogPath}`
        );
      } catch (err) {
        console.error("❌ Failed to clean up empty failed batches log:", err);
      }
    } else {
      console.log(
        `📋 Failed batches log preserved at: ${failedBatchesLogPath}`
      );
    }
  }
}

// Helper function to upload failed batches log to S3
async function uploadFailedBatchesLogToS3(logFilePath, accountId) {
  try {
    if (!fs.existsSync(logFilePath)) {
      return null;
    }

    const fileName = path.basename(logFilePath);
    const s3Key = `failed_batches_logs/${fileName}`;

    const fileStream = fs.createReadStream(logFilePath);
    const uploadResult = await s3
      .upload({
        Bucket: UPLOAD_BUCKET,
        Key: s3Key,
        Body: fileStream,
        ContentType: "application/json",
        Metadata: {
          accountId: accountId,
          uploadTime: new Date().toISOString(),
        },
      })
      .promise();

    console.log(
      `📤 Failed batches log uploaded to S3: ${uploadResult.Location}`
    );
    return uploadResult.Location;
  } catch (error) {
    console.error("❌ Failed to upload failed batches log to S3:", error);
    return null;
  }
}

module.exports = router;
