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

// First, add this helper function near your other helper functions
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Helper function to create failed batches log file
const createFailedBatchesLogFile = (accountId) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `failed_batches_${accountId}_${timestamp}.json`;
  const filePath = path.join(os.tmpdir(), fileName);

  // Initialize the file with an empty array
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

// Helper function to append failed batch to log file
const logFailedBatch = (logFilePath, batchNumber, events, error, response) => {
  try {
    // Read existing log file
    const logData = JSON.parse(fs.readFileSync(logFilePath, "utf8"));

    // Create failed batch entry
    const failedBatchEntry = {
      batchNumber,
      timestamp: new Date().toISOString(),
      eventsCount: events.length,
      error: {
        message: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
        responseHeaders: error.response?.headers,
      },
      payload: {
        d: events, // The actual payload that failed
      },
    };

    // Add to failed batches array
    logData.failedBatches.push(failedBatchEntry);

    // Write back to file
    fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));

    console.log(`💾 Failed batch ${batchNumber} logged to: ${logFilePath}`);
  } catch (logError) {
    console.error("❌ Failed to log failed batch:", logError);
  }
};

// Helper function to upload failed batches log to S3
const uploadFailedBatchesLogToS3 = async (logFilePath, accountId) => {
  try {
    if (!fs.existsSync(logFilePath)) {
      return null;
    }

    const fileStats = fs.statSync(logFilePath);
    if (fileStats.size === 0) {
      return null; // Don't upload empty files
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
};

router.post("/upload_event", upload.single("file"), async (req, res) => {
  // Track file for cleanup
  const uploadedFilePath = req.file ? req.file.path : null;
  let failedBatchesLogPath = null;
  let failedBatchesCount = 0;

  try {
    const {
      accountId,
      passcode,
      apiUrl,
      mapping,
      itemsFields,
      groupByField,
      specialFields,
    } = req.body;

    const parsedMapping = JSON.parse(mapping);
    const parsedItemsFields = JSON.parse(itemsFields || "[]");
    const parsedSpecialFields = JSON.parse(specialFields || "{}");
    const batchSizeNum = 1000;
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

    // Determine the API URL - use provided URL or construct the default CleverTap endpoint
    const uploadUrl = apiUrl || "https://api.clevertap.com/1/upload";

    // Create a S3 key for logging
    const fileKey = `charged_events_${Date.now()}${path.extname(
      req.file.originalname
    )}`;

    // Track statistics
    let totalEvents = 0;
    let totalRows = 0;
    let batchNumber = 0;
    const results = {
      totalRows: 0,
      totalEvents: 0,
      groupedEvents: 0,
      batches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      results: [],
    };

    // Configure headers for CleverTap API
    const requestHeaders = parsedHeaders || {
      "X-CleverTap-Account-Id": accountId,
      "X-CleverTap-Passcode": passcode,
      "Content-Type": "application/json",
    };

    // Helper functions for data processing
    const setNestedProperty = (obj, path, value) => {
      if (!path || typeof path !== "string") return;
      const parts = path.split(".");
      let current = obj;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }

      current[parts[parts.length - 1]] = value;
    };

    const parseJsonValue = (value, type = "string") => {
      if (value === undefined || value === null) return value;

      // Handle based on specified type
      switch (type) {
        case "integer":
          return !isNaN(value) ? parseInt(value, 10) : 0;
        case "float":
          return !isNaN(value) ? parseFloat(value) : 0.0;
        case "boolean":
          if (typeof value === "boolean") return value;
          return String(value).toLowerCase() === "true";
        case "string":
          // For string type, try to detect and parse JSON automatically
          if (typeof value === "string") {
            const trimmedValue = value.trim();
            // Check if the string looks like JSON (starts with { or [)
            if (
              (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) ||
              (trimmedValue.startsWith("[") && trimmedValue.endsWith("]"))
            ) {
              try {
                return JSON.parse(trimmedValue);
              } catch (e) {
                // If JSON parsing fails, return as string
                return value;
              }
            }
          }
          return String(value);
        case "json":
          // Explicit JSON parsing
          if (typeof value === "string") {
            try {
              return JSON.parse(value);
            } catch (e) {
              return value;
            }
          }
          return value;
        default:
          return value;
      }
    };

    // Function to process a batch of events
    async function processBatch(events) {
      if (events.length === 0) return;

      try {
        // Format the payload according to CleverTap API structure with 'd' array
        const payload = { d: events };
        const currentBatchNumber = batchNumber + 1;

        console.log(
          `🚀 Sending batch ${currentBatchNumber} with ${events.length} events to ${uploadUrl}`
        );
        console.log(
          `Batch ${currentBatchNumber} payload size: ${
            JSON.stringify(payload).length
          } bytes`
        );

        const startTime = Date.now();
        const response = await axios.post(uploadUrl, payload, {
          headers: requestHeaders,
          maxBodyLength: Infinity, // Allow large payloads
          maxContentLength: Infinity, // Allow large responses
        });
        const duration = Date.now() - startTime;

        batchNumber++;
        results.batches++;
        results.successfulBatches++;

        // Enhanced response logging
        console.log(
          `✅ Batch ${results.batches} completed in ${duration}ms with status ${response.status}`
        );
        console.log(`Response: ${JSON.stringify(response.data)}`);

        results.results.push({
          batchNumber: results.batches,
          eventsCount: events.length,
          status: response.data,
          responseCode: response.status,
          durationMs: duration,
          timestamp: new Date().toISOString(),
          success: true,
        });
      } catch (error) {
        batchNumber++;
        results.batches++;
        results.failedBatches++;
        failedBatchesCount++;

        console.error(
          "❌ Batch upload error:",
          error.response?.data || error.message
        );

        // Log more details about the failed batch
        console.error(`Failed batch had ${events.length} events`);
        if (error.response) {
          console.error(`Response status: ${error.response.status}`);
          console.error(
            `Response headers: ${JSON.stringify(error.response.headers)}`
          );
        }

        // Log the failed batch to file
        logFailedBatch(
          failedBatchesLogPath,
          results.batches,
          events,
          error,
          error.response
        );

        results.results.push({
          batchNumber: results.batches,
          eventsCount: events.length,
          error: error.response?.data || error.message,
          status: "error",
          responseCode: error.response?.status,
          timestamp: new Date().toISOString(),
          success: false,
        });
      }
    }

    // Process the CSV in chunks using streams for memory efficiency
    const processLargeFile = async () => {
      // Maps transaction groups to their events to avoid memory buildup
      const transactionMap = new Map();
      let allEvents = [];

      return new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path, { highWaterMark: 64 * 1024 }) // 64KB chunks for better performance
          .pipe(csv.parse({ headers: true }))
          .on("data", (row) => {
            totalRows++;

            // Skip empty rows
            if (!row || Object.keys(row).length === 0) return;

            // Find identity and timestamp from the mappings
            let identity = null;
            let timestamp = Math.floor(Date.now() / 1000); // Default timestamp

            // Special field values collection
            const specialValues = {};

            // Extract identity and timestamp first
            Object.entries(parsedMapping).forEach(
              ([csvColumn, targetPathObj]) => {
                try {
                  // Handle both string and object formats
                  const targetPath =
                    typeof targetPathObj === "object"
                      ? targetPathObj.fieldName
                      : targetPathObj;
                  const dataType =
                    typeof targetPathObj === "object"
                      ? targetPathObj.type
                      : "string";

                  if (!targetPath || typeof targetPath !== "string") return;

                  if (targetPath === "identity" && row[csvColumn]) {
                    identity = parseJsonValue(row[csvColumn], dataType);
                  } else if (targetPath === "ts" && row[csvColumn]) {
                    const timeValue = row[csvColumn];

                    if (dataType === "integer" || !isNaN(timeValue)) {
                      timestamp = Number(timeValue);
                    } else {
                      // Try to parse as date if needed
                      const parsedDate = new Date(timeValue);
                      if (!isNaN(parsedDate.getTime())) {
                        timestamp = Math.floor(parsedDate.getTime() / 1000);
                      }
                    }
                  }
                  // Handle other special fields
                  else if (parsedSpecialFields[targetPath] && row[csvColumn]) {
                    specialValues[targetPath] = parseJsonValue(
                      row[csvColumn],
                      dataType
                    );
                  }
                } catch (error) {
                  console.error(`Error parsing field ${csvColumn}:`, error);
                }
              }
            );

            // Generate fallback identity if needed
            if (!identity) {
              identity = `user_${Date.now()}_${totalEvents}`;
            }

            // Get or create group value for transaction grouping
            const groupValue =
              row[groupByField] || `group_${Date.now()}_${totalEvents}`;

            // Find or create the event object for this group
            let eventObj;
            if (transactionMap.has(groupValue)) {
              eventObj = transactionMap.get(groupValue);
            } else {
              // Create new event object with CleverTap structure
              eventObj = {
                identity: identity, // Standard CleverTap field name for identity
                ts: timestamp, // Standard CleverTap field name for timestamp
                type: "event",
                evtName: evtName,
                evtData: {},
              };

              // Use CleverTap field name for the grouping field
              const groupFieldName = parsedSpecialFields.groupByFieldMapping;
              eventObj.evtData[groupFieldName] = groupValue;

              // Add any special top-level fields from parsedSpecialFields
              if (parsedSpecialFields.topLevelFields) {
                for (const [key, value] of Object.entries(
                  parsedSpecialFields.topLevelFields
                )) {
                  if (
                    key !== "identity" &&
                    key !== "ts" &&
                    key !== "type" &&
                    key !== "evtName" &&
                    key !== "evtData"
                  ) {
                    eventObj[key] = value;
                  }
                }
              }

              // Add special values collected from the row
              for (const [key, value] of Object.entries(specialValues)) {
                if (
                  key !== "identity" &&
                  key !== "ts" &&
                  key !== "type" &&
                  key !== "evtName" &&
                  key !== "evtData"
                ) {
                  eventObj[key] = value;
                }
              }

              transactionMap.set(groupValue, eventObj);
              totalEvents++;
            }

            // Process regular properties
            Object.entries(parsedMapping).forEach(
              ([csvColumn, targetPathObj]) => {
                try {
                  // Handle both string and object formats
                  const targetPath =
                    typeof targetPathObj === "object"
                      ? targetPathObj.fieldName
                      : targetPathObj;
                  const dataType =
                    typeof targetPathObj === "object"
                      ? targetPathObj.type
                      : "string";

                  if (!targetPath || typeof targetPath !== "string") return;

                  if (
                    csvColumn in row &&
                    row[csvColumn] !== undefined &&
                    row[csvColumn] !== null &&
                    row[csvColumn] !== "" &&
                    targetPath !== "identity" &&
                    targetPath !== "ts" &&
                    !parsedSpecialFields[targetPath] // Skip fields already handled as special
                  ) {
                    const value = parseJsonValue(row[csvColumn], dataType);

                    // Handle nested properties
                    if (targetPath.startsWith("evtData.")) {
                      const propertyPath = targetPath.substring(8); // Remove "evtData." prefix
                      setNestedProperty(eventObj.evtData, propertyPath, value);
                    }
                  }
                } catch (error) {
                  console.error(`Error processing field ${csvColumn}:`, error);
                }
              }
            );

            // Process items fields for this row using the SIMPLE APPROACH that works
            if (parsedItemsFields.length > 0) {
              const itemObj = {};
              parsedItemsFields.forEach((field) => {
                try {
                  if (
                    row[field.source] !== undefined &&
                    row[field.source] !== null &&
                    row[field.source] !== ""
                  ) {
                    itemObj[field.target] = parseJsonValue(
                      row[field.source],
                      field.type
                    );
                  }
                } catch (error) {
                  console.error(
                    `Error processing item field ${field.source}:`,
                    error
                  );
                }
              });

              // Only add non-empty item objects
              if (Object.keys(itemObj).length > 0) {
                // Initialize Items array if needed
                if (!eventObj.evtData.Items) {
                  eventObj.evtData.Items = [];
                }
                // Add the item to the array
                eventObj.evtData.Items.push(itemObj);
                // No need to update the map since we're working with a reference
              }
            }

            // Every 10,000 rows, log progress
            if (totalRows % 10000 === 0) {
              console.log(`Processed ${totalRows} rows, ${totalEvents} events`);

              // Force garbage collection if available
              if (global.gc) {
                try {
                  global.gc();
                } catch (e) {
                  console.error("Failed to force garbage collection", e);
                }
              }
            }
          })
          .on("end", async () => {
            // Convert the map values to an array of events
            allEvents = Array.from(transactionMap.values());

            // Calculate the raw event count and final event count
            const rawEventCount = totalEvents;
            const finalEventCount = allEvents.length;
            const eventsReduction = rawEventCount - finalEventCount;

            // Process batches sequentially
            console.log(`
                ---------------------------------------------
                EVENT COUNT SUMMARY:
                - Total CSV rows: ${totalRows}
                - Raw events created: ${rawEventCount}  
                - Final events after grouping: ${finalEventCount}
                - Events reduced by grouping: ${eventsReduction}
                ---------------------------------------------
                Processing ${finalEventCount} events in batches of ${batchSizeNum}...`);

            // Process one batch at a time with enhanced logging and delay
            for (let i = 0; i < allEvents.length; i += batchSizeNum) {
              const batch = allEvents.slice(i, i + batchSizeNum);
              const batchNumber = Math.floor(i / batchSizeNum) + 1;

              if (batch.length > 0) {
                try {
                  // Log batch details before processing
                  console.log(
                    `Preparing batch ${batchNumber}/${Math.ceil(
                      allEvents.length / batchSizeNum
                    )}, size: ${batch.length} events`
                  );

                  // Optional: Log first event in batch to help with debugging
                  console.log(
                    `Batch ${batchNumber} first event identity: ${batch[0].identity}, timestamp: ${batch[0].ts}`
                  );

                  // Wait for each batch to complete before sending the next one
                  await processBatch(batch);

                  // Log successful completion
                  console.log(`Successfully completed batch ${batchNumber}`);

                  // Add 2-second delay before the next batch (but not after the last batch)
                  if (i + batchSizeNum < allEvents.length) {
                    console.log(
                      `Waiting 2 seconds before processing next batch...`
                    );
                    await sleep(1000);
                  }
                } catch (e) {
                  console.error(`Batch ${batchNumber} processing failed:`, e);

                  // You might want to add a longer delay after errors
                  console.log(
                    `Error occurred, waiting 5 seconds before continuing...`
                  );
                  await sleep(2000);
                }
              }
            }

            // Update results with detailed metrics
            results.totalRows = totalRows;
            results.rawEvents = rawEventCount;
            results.totalEvents = finalEventCount;
            results.groupedEvents = results.groupedEvents;
            results.eventsReduction = eventsReduction;

            results.batches = results.batches || 0;
            results.successfulBatches = results.successfulBatches || 0;
            results.failedBatches = results.failedBatches || 0;

            console.log(`File name: ${req.file.originalname}`);
            console.log(
              `Finished processing with ${totalRows} rows into ${finalEventCount} events in ${results.batches} batches`
            );
            console.log(
              `Successful batches: ${results.successfulBatches}, Failed batches: ${results.failedBatches}`
            );

            console.log("Failed batches log file path:", failedBatchesLogPath);

            resolve();
          })
          .on("error", (error) => {
            console.error("CSV parsing error:", error);
            reject(error);
          });
      });
    };

    // Process the file
    await processLargeFile();

    // Upload the original file to S3 if needed for audit purposes
    try {
      const fileStream = fs.createReadStream(req.file.path);
      await s3
        .upload({
          Bucket: UPLOAD_BUCKET,
          Key: fileKey,
          Body: fileStream,
          ContentType: req.file.mimetype || "text/csv",
        })
        .promise();
    } catch (s3Error) {
      console.error("S3 upload failed:", s3Error);
    }

    // Upload failed batches log to S3 if there were failures
    let failedBatchesLogUrl = null;
    if (failedBatchesCount > 0 && failedBatchesLogPath) {
      failedBatchesLogUrl = await uploadFailedBatchesLogToS3(
        failedBatchesLogPath,
        accountId
      );
    }

    // Add failed batches info to results
    results.failedBatchesLogPath = failedBatchesLogPath;
    results.failedBatchesLogUrl = failedBatchesLogUrl;
    results.totalFailedBatches = failedBatchesCount;

    res.json(results);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: `Failed to process events: ${error.message}`,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    // Clean up the temporary files
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (err) {
        console.error("Failed to clean up uploaded file:", err);
      }
    }

    // Clean up the failed batches log file from local temp (keep S3 copy)
    if (failedBatchesLogPath && fs.existsSync(failedBatchesLogPath)) {
      try {
        // Only delete if we successfully uploaded to S3 or if there were no failures
        if (failedBatchesCount === 0) {
          fs.unlinkSync(failedBatchesLogPath);
        } else {
          console.log(
            `💾 Failed batches log preserved at: ${failedBatchesLogPath}`
          );
        }
      } catch (err) {
        console.error("Failed to clean up failed batches log file:", err);
      }
    }
  }
});

router.post("/preview_event", upload.single("file"), async (req, res) => {
  // Track file path for cleanup
  const uploadedFilePath = req.file ? req.file.path : null;

  try {
    const { mapping, itemsFields, groupByField, specialFields } = req.body;
    const parsedMapping = JSON.parse(mapping);
    const parsedItemsFields = JSON.parse(itemsFields || "[]");
    const parsedSpecialFields = JSON.parse(specialFields || "{}");

    // Event name is always "Charged" unless specified in special fields
    const evtName = parsedSpecialFields.eventName || "Charged";

    if (!req.file || !groupByField) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    let totalEvents = 0;
    let totalRowsProcessed = 0;
    // Use a map to track events by the grouping value only (like oldEvents.js)
    const eventsMap = new Map();

    // Helper functions
    const setNestedProperty = (obj, path, value) => {
      if (!path || typeof path !== "string") return;
      const parts = path.split(".");
      let current = obj;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }

      current[parts[parts.length - 1]] = value;
    };

    const parseJsonValue = (value, type = "string") => {
      if (value === undefined || value === null) return value;

      // Handle based on specified type
      switch (type) {
        case "integer":
          return !isNaN(value) ? parseInt(value, 10) : 0;
        case "float":
          return !isNaN(value) ? parseFloat(value) : 0.0;
        case "boolean":
          if (typeof value === "boolean") return value;
          return String(value).toLowerCase() === "true";
        case "string":
          // For string type, try to detect and parse JSON automatically
          if (typeof value === "string") {
            const trimmedValue = value.trim();
            // Check if the string looks like JSON (starts with { or [)
            if (
              (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) ||
              (trimmedValue.startsWith("[") && trimmedValue.endsWith("]"))
            ) {
              try {
                return JSON.parse(trimmedValue);
              } catch (e) {
                // If JSON parsing fails, return as string
                return value;
              }
            }
          }
          return String(value);
        case "json":
          // Explicit JSON parsing
          if (typeof value === "string") {
            try {
              return JSON.parse(value);
            } catch (e) {
              return value;
            }
          }
          return value;
        default:
          return value;
      }
    };

    // Use a counter to limit the preview to 5 events maximum
    let previewCount = 0;
    const MAX_PREVIEW_EVENTS = 5;

    try {
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv.parse({ headers: true }))
          .on("data", (row) => {
            totalRowsProcessed++;

            // Skip empty rows
            // if (!row || Object.keys(row).length === 0) return;

            // Find identity and timestamp from the mappings
            let identity = null;
            let timestamp = Math.floor(Date.now() / 1000); // Default to current time

            // Special field values collection
            const specialValues = {};

            Object.entries(parsedMapping).forEach(
              ([csvColumn, targetPathObj]) => {
                try {
                  // Handle both string and object formats
                  const targetPath =
                    typeof targetPathObj === "object"
                      ? targetPathObj.fieldName
                      : targetPathObj;
                  const dataType =
                    typeof targetPathObj === "object"
                      ? targetPathObj.type
                      : "string";

                  if (!targetPath || typeof targetPath !== "string") return;

                  if (targetPath === "identity" && row[csvColumn]) {
                    identity = parseJsonValue(row[csvColumn], dataType);
                  } else if (targetPath === "ts" && row[csvColumn]) {
                    const timeValue = row[csvColumn];

                    if (dataType === "integer" || !isNaN(timeValue)) {
                      timestamp = Number(timeValue);
                    } else {
                      // Try to parse as date if needed
                      const parsedDate = new Date(timeValue);
                      if (!isNaN(parsedDate.getTime())) {
                        timestamp = Math.floor(parsedDate.getTime() / 1000);
                      }
                    }
                  }
                  // Handle other special fields
                  else if (parsedSpecialFields[targetPath] && row[csvColumn]) {
                    specialValues[targetPath] = parseJsonValue(
                      row[csvColumn],
                      dataType
                    );
                  }
                } catch (error) {
                  console.error(`Error parsing field ${csvColumn}:`, error);
                }
              }
            );

            // If we couldn't find an identity, generate a fallback
            if (!identity) {
              identity = `user_${Date.now()}_${totalEvents}`;
            }

            // Get the grouping value (this is the key change from your working code)
            const groupValue =
              row[groupByField] || `group_${Date.now()}_${totalEvents}`;

            // Initialize event or get existing event by group value
            let eventObj;
            if (eventsMap.has(groupValue)) {
              eventObj = eventsMap.get(groupValue);
            } else {
              if (previewCount < MAX_PREVIEW_EVENTS) {
                // Create event with CleverTap format
                eventObj = {
                  identity: identity, // Standard CleverTap field name for identity
                  ts: timestamp, // Standard CleverTap field name for timestamp
                  type: "event",
                  evtName: evtName,
                  evtData: {},
                };

                // Use CleverTap field name for the grouping field
                // If a specific mapping is provided, use it; otherwise use "Bill No"
                const groupFieldName =
                  parsedSpecialFields.groupByFieldMapping || "Bill No";
                eventObj.evtData[groupFieldName] = groupValue;

                // Add any special top-level fields from parsedSpecialFields
                if (parsedSpecialFields.topLevelFields) {
                  for (const [key, value] of Object.entries(
                    parsedSpecialFields.topLevelFields
                  )) {
                    if (
                      key !== "identity" &&
                      key !== "ts" &&
                      key !== "type" &&
                      key !== "evtName" &&
                      key !== "evtData"
                    ) {
                      eventObj[key] = value;
                    }
                  }
                }

                // Add special values collected from the row
                for (const [key, value] of Object.entries(specialValues)) {
                  if (
                    key !== "identity" &&
                    key !== "ts" &&
                    key !== "type" &&
                    key !== "evtName" &&
                    key !== "evtData"
                  ) {
                    eventObj[key] = value;
                  }
                }

                eventsMap.set(groupValue, eventObj);
                totalEvents++;
                previewCount++;
              } else {
                return;
              }
            }

            // Process regular properties
            Object.entries(parsedMapping).forEach(
              ([csvColumn, targetPathObj]) => {
                try {
                  // Handle both string and object formats
                  const targetPath =
                    typeof targetPathObj === "object"
                      ? targetPathObj.fieldName
                      : targetPathObj;
                  const dataType =
                    typeof targetPathObj === "object"
                      ? targetPathObj.type
                      : "string";

                  if (!targetPath || typeof targetPath !== "string") return;

                  if (
                    csvColumn in row &&
                    row[csvColumn] !== undefined &&
                    row[csvColumn] !== null &&
                    row[csvColumn] !== "" &&
                    targetPath !== "identity" &&
                    targetPath !== "ts" &&
                    !parsedSpecialFields[targetPath] // Skip fields already handled as special
                  ) {
                    const value = parseJsonValue(row[csvColumn], dataType);

                    // Handle nested properties
                    if (targetPath.startsWith("evtData.")) {
                      const propertyPath = targetPath.substring(8); // Remove "evtData." prefix
                      setNestedProperty(eventObj.evtData, propertyPath, value);
                    }
                  }
                } catch (error) {
                  console.error(`Error processing field ${csvColumn}:`, error);
                }
              }
            );

            // Process items fields for this row - SIMPLE APPROACH THAT WORKS
            if (parsedItemsFields.length > 0) {
              const itemObj = {};
              parsedItemsFields.forEach((field) => {
                try {
                  if (
                    row[field.source] !== undefined &&
                    row[field.source] !== null &&
                    row[field.source] !== ""
                  ) {
                    itemObj[field.target] = parseJsonValue(
                      row[field.source],
                      field.type
                    );
                  }
                } catch (error) {
                  console.error(
                    `Error processing item field ${field.source}:`,
                    error
                  );
                }
              });

              // Only add non-empty item objects
              if (Object.keys(itemObj).length > 0) {
                // Initialize Items array if needed
                if (!eventObj.evtData.Items) {
                  eventObj.evtData.Items = [];
                }
                // Add the item to the array
                eventObj.evtData.Items.push(itemObj);
                // No need to update the map since we're working with a reference
              }
            }
          })
          .on("end", () => {
            // Convert the map values to an array
            const events = Array.from(eventsMap.values());

            // Return the preview data
            res.json({
              totalEvents,
              previewEvents: events,
              totalRowsInFile: totalRowsProcessed,
              hasMoreRecords: totalRowsProcessed > MAX_PREVIEW_EVENTS,
            });
            resolve();
          })
          .on("error", (error) => {
            console.error("CSV parsing error:", error);
            reject(error);
          });
      });
    } catch (error) {
      console.error("Preview error:", error);
      throw error;
    }
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({
      error: `Failed to generate preview: ${error.message}`,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    // Clean up in case of error
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (err) {
        console.error("Failed to clean up file:", err);
      }
    }
  }
});

module.exports = router;
