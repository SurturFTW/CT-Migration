const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("fast-csv");
const axios = require("axios");
const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../uploads"),
  filename: (req, file, cb) => {
    cb(null, `charged_events_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

router.post("/upload_event", upload.single("file"), async (req, res) => {
  try {
    const { accountId, passcode, apiUrl, mapping, itemsFields, groupByField } =
      req.body;
    const parsedMapping = JSON.parse(mapping);
    const parsedItemsFields = JSON.parse(itemsFields || "[]");
    const batchSizeNum = 1000;
    const parsedHeaders = req.body.headers
      ? JSON.parse(req.body.headers)
      : null;

    // Event name is always "Charged"
    const evtName = "Charged";

    if (!accountId || !passcode || !req.file || !groupByField) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // Determine the API URL - use provided URL or construct the default CleverTap endpoint
    const uploadUrl = apiUrl || "https://api.clevertap.com/1/upload";

    let totalEvents = 0;
    // Use a map to track events by groupByField value
    const eventsMap = new Map();

    // Simplify nested property assignment with this helper function
    const setNestedProperty = (obj, path, value) => {
      if (!path) return;
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

    // Improved function to parse JSON strings and handle data types
    const parseJsonValue = (value) => {
      if (typeof value !== "string") return value;

      const trimmedValue = value.trim();

      // Check if it looks like JSON
      if (
        (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) ||
        (trimmedValue.startsWith("[") && trimmedValue.endsWith("]"))
      ) {
        try {
          return JSON.parse(trimmedValue);
        } catch (e) {
          console.log(
            `Failed to parse JSON: "${trimmedValue}". Using as string.`
          );
          return trimmedValue;
        }
      }

      // Convert to number if appropriate
      if (!isNaN(trimmedValue) && trimmedValue !== "") {
        return Number(trimmedValue);
      }

      // Handle boolean values
      if (trimmedValue.toLowerCase() === "true") return true;
      if (trimmedValue.toLowerCase() === "false") return false;

      return trimmedValue;
    };

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv.parse({ headers: true }))
        .on("data", (row) => {
          // Skip empty rows
          if (Object.keys(row).length === 0) return;

          // Find identity and timestamp from the mappings
          let identity = null;
          let timestamp = Math.floor(Date.now() / 1000); // Default to current time

          Object.entries(parsedMapping).forEach(([csvColumn, targetPath]) => {
            if (targetPath === "identity" && row[csvColumn]) {
              identity = row[csvColumn];
            } else if (targetPath === "ts" && row[csvColumn]) {
              const timeValue = row[csvColumn];
              // Handle both Unix timestamps and formatted dates
              if (!isNaN(timeValue)) {
                timestamp = Number(timeValue);
              } else {
                // Try to parse as date if it's not a number
                const parsedDate = new Date(timeValue);
                if (!isNaN(parsedDate.getTime())) {
                  timestamp = Math.floor(parsedDate.getTime() / 1000);
                }
              }
            }
          });

          // If we couldn't find an identity, generate a fallback
          if (!identity) {
            identity = `user_${Date.now()}_${totalEvents}`;
          }

          // Get the grouping value to organize related items into single transactions
          const groupValue =
            row[groupByField] || `group_${Date.now()}_${totalEvents}`;

          // Initialize event or get existing event by group value
          let eventObj;
          if (eventsMap.has(groupValue)) {
            eventObj = eventsMap.get(groupValue);
          } else {
            eventObj = {
              identity: identity,
              ts: timestamp,
              type: "event",
              evtName: evtName,
              evtData: {},
            };
            eventsMap.set(groupValue, eventObj);
            totalEvents++;
          }

          // Process regular properties
          Object.entries(parsedMapping).forEach(([csvColumn, targetPath]) => {
            if (
              csvColumn in row &&
              row[csvColumn] &&
              targetPath !== "identity" &&
              targetPath !== "ts"
            ) {
              let value = parseJsonValue(row[csvColumn]);

              // Handle nested properties
              if (targetPath.startsWith("evtData.")) {
                const propertyPath = targetPath.substring(8); // Remove "evtData." prefix
                setNestedProperty(eventObj.evtData, propertyPath, value);
              }
            }
          });

          // Process items fields for this row
          if (parsedItemsFields.length > 0) {
            const itemObj = {};
            parsedItemsFields.forEach((field) => {
              if (row[field.source]) {
                itemObj[field.target] = parseJsonValue(row[field.source]);
              }
            });

            // Only add non-empty item objects
            if (Object.keys(itemObj).length > 0) {
              if (!eventObj.evtData.Items) {
                eventObj.evtData.Items = [];
              }
              eventObj.evtData.Items.push(itemObj);
            }
          }
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Convert the map values to an array for batching
    const events = Array.from(eventsMap.values());

    const results = {
      totalEvents,
      groupedEvents: events.length,
      batches: 0,
      results: [],
    };

    // Configure headers for CleverTap API
    const requestHeaders = parsedHeaders || {
      "X-CleverTap-Account-Id": accountId,
      "X-CleverTap-Passcode": passcode,
      "Content-Type": "application/json",
    };

    console.log(
      `Sending ${events.length} "Charged" events to CleverTap in batches of ${batchSizeNum}`
    );

    // Send events in batches with proper "d" wrapper
    for (let i = 0; i < events.length; i += batchSizeNum) {
      const batch = events.slice(i, i + batchSizeNum);
      try {
        // Format the payload according to CleverTap API structure
        const payload = { d: batch };

        console.log(
          `Sending batch ${results.batches + 1} with ${batch.length} events`
        );

        const response = await axios.post(uploadUrl, payload, {
          headers: requestHeaders,
        });

        results.batches++;
        results.results.push({
          batchNumber: results.batches,
          eventsCount: batch.length,
          status: response.data,
          responseCode: response.status,
        });

        console.log(`Batch ${results.batches} success:`, response.data);
      } catch (error) {
        console.error(
          "Batch upload error:",
          error.response?.data || error.message
        );

        results.results.push({
          batchNumber: results.batches + 1,
          eventsCount: batch.length,
          error: error.response?.data || error.message,
          status: "error",
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: `Failed to process events: ${error.message}`,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    // Clean up the uploaded file
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting file:", err);
      });
    }
  }
});

router.post("/preview_event", upload.single("file"), async (req, res) => {
  try {
    const { mapping, itemsFields, groupByField } = req.body;
    const parsedMapping = JSON.parse(mapping);
    const parsedItemsFields = JSON.parse(itemsFields || "[]");

    if (!req.file || !groupByField) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    let totalEvents = 0;
    // Use a map to track events by groupByField value
    const eventsMap = new Map();

    // Reuse the same helper functions from the upload route
    const setNestedProperty = (obj, path, value) => {
      if (!path) return;
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

    const parseJsonValue = (value) => {
      if (typeof value !== "string") return value;
      const trimmedValue = value.trim();

      if (
        (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) ||
        (trimmedValue.startsWith("[") && trimmedValue.endsWith("]"))
      ) {
        try {
          return JSON.parse(trimmedValue);
        } catch (e) {
          return trimmedValue;
        }
      }

      if (!isNaN(trimmedValue) && trimmedValue !== "") {
        return Number(trimmedValue);
      }

      if (trimmedValue.toLowerCase() === "true") return true;
      if (trimmedValue.toLowerCase() === "false") return false;

      return trimmedValue;
    };

    // Use a counter to limit the preview to 5 events maximum
    let previewCount = 0;
    const MAX_PREVIEW_EVENTS = 5;

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv.parse({ headers: true }))
        .on("data", (row) => {
          // Skip if we've reached the preview limit
          if (previewCount >= MAX_PREVIEW_EVENTS) return;

          // Skip empty rows
          if (Object.keys(row).length === 0) return;

          // Find identity and timestamp from the mappings
          let identity = null;
          let timestamp = Math.floor(Date.now() / 1000); // Default to current time

          Object.entries(parsedMapping).forEach(([csvColumn, targetPath]) => {
            if (targetPath === "identity" && row[csvColumn]) {
              identity = row[csvColumn];
            } else if (targetPath === "ts" && row[csvColumn]) {
              const timeValue = row[csvColumn];
              // Handle both Unix timestamps and formatted dates
              if (!isNaN(timeValue)) {
                timestamp = Number(timeValue);
              } else {
                // Try to parse as date if it's not a number
                const parsedDate = new Date(timeValue);
                if (!isNaN(parsedDate.getTime())) {
                  timestamp = Math.floor(parsedDate.getTime() / 1000);
                }
              }
            }
          });

          // If we couldn't find an identity, generate a fallback
          if (!identity) {
            identity = `user_${Date.now()}_${totalEvents}`;
          }

          // Get the grouping value to organize related items into single transactions
          const groupValue =
            row[groupByField] || `group_${Date.now()}_${totalEvents}`;

          // Initialize event or get existing event by group value
          let eventObj;
          if (eventsMap.has(groupValue)) {
            eventObj = eventsMap.get(groupValue);
          } else {
            if (previewCount < MAX_PREVIEW_EVENTS) {
              eventObj = {
                identity: identity,
                ts: timestamp,
                type: "event",
                evtName: "Charged",
                evtData: {},
              };
              eventsMap.set(groupValue, eventObj);
              totalEvents++;
              previewCount++;
            } else {
              return;
            }
          }

          // Process regular properties
          Object.entries(parsedMapping).forEach(([csvColumn, targetPath]) => {
            if (
              csvColumn in row &&
              row[csvColumn] &&
              targetPath !== "identity" &&
              targetPath !== "ts"
            ) {
              let value = parseJsonValue(row[csvColumn]);

              // Handle nested properties
              if (targetPath.startsWith("evtData.")) {
                const propertyPath = targetPath.substring(8); // Remove "evtData." prefix
                setNestedProperty(eventObj.evtData, propertyPath, value);
              }
            }
          });

          // Process items fields for this row
          if (parsedItemsFields.length > 0) {
            const itemObj = {};
            parsedItemsFields.forEach((field) => {
              if (row[field.source]) {
                itemObj[field.target] = parseJsonValue(row[field.source]);
              }
            });

            // Only add non-empty item objects
            if (Object.keys(itemObj).length > 0) {
              if (!eventObj.evtData.Items) {
                eventObj.evtData.Items = [];
              }
              eventObj.evtData.Items.push(itemObj);
            }
          }
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Convert the map values to an array
    const events = Array.from(eventsMap.values());

    // Return the preview data
    res.json({
      totalEvents,
      previewEvents: events,
      totalRowsInFile:
        totalEvents > MAX_PREVIEW_EVENTS
          ? totalEvents
          : "Not calculated for preview",
    });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({
      error: `Failed to generate preview: ${error.message}`,
    });
  } finally {
    // Clean up the uploaded file
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting preview file:", err);
      });
    }
  }
});

module.exports = router;
