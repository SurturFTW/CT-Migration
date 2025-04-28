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
    const { accountId, passcode, apiUrl, mapping, headers } = req.body;
    const parsedMapping = JSON.parse(mapping);
    const batchSizeNum = 1000;
    const parsedHeaders = headers ? JSON.parse(headers) : null;

    // Event name is always "Charged"
    const evtName = "Charged";

    if (!accountId || !passcode || !req.file) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    // Determine the API URL - use provided URL or construct the default CleverTap endpoint
    const uploadUrl = apiUrl || "https://api.clevertap.com/1/upload";

    let totalEvents = 0;
    // Use a map to track events by identity+timestamp to enable merging
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

    // Helper function to flatten objects while preserving special fields
    const flattenObject = (obj, prefix = "") => {
      let flattened = {};

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;

          // Skip flattening for Items array - CleverTap allows nested structure here
          if (key === "Items") {
            flattened[key] = value;
            continue;
          }

          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            Object.assign(flattened, flattenObject(value, newKey));
          } else {
            flattened[newKey] = value;
          }
        }
      }

      return flattened;
    };

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv.parse({ headers: true }))
        .on("data", (row) => {
          // Handle timestamp - ensure it's a number
          let timestamp = Math.floor(Date.now() / 1000); // Default to current time

          if (row.timestamp || row.ts) {
            const timeValue = row.timestamp || row.ts;
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

          // Make sure we have a valid identity
          const identity =
            row.identity ||
            row.email ||
            row.FBID ||
            row.userId ||
            row.Identity ||
            row.id ||
            row.ID ||
            `user_${Date.now()}_${totalEvents}`;

          // Initialize eventData object with proper structure
          const eventData = {};

          // Process all CSV columns according to the mapping
          Object.entries(parsedMapping).forEach(([csvColumn, targetPath]) => {
            if (csvColumn in row && row[csvColumn]) {
              let value = row[csvColumn];

              // Parse the value appropriately
              value = parseJsonValue(value);

              // Skip properties that should be at the top level of the event
              if (["ts", "type", "identity", "evtName"].includes(targetPath)) {
                return;
              }

              // Special handling for Items array
              if (targetPath === "Items" || targetPath === "evtData.Items") {
                try {
                  // Ensure value is an array with proper format
                  if (!Array.isArray(value)) {
                    if (typeof value === "string") {
                      value = JSON.parse(value);
                      value = Array.isArray(value) ? value : [value];
                    } else if (typeof value === "object" && value !== null) {
                      value = [value];
                    } else {
                      value = [{ item: value }];
                    }
                  }

                  // Make sure each item in Items array has the right format
                  value = value.map((item) => {
                    if (typeof item !== "object" || item === null) {
                      return { item: item };
                    }
                    return item;
                  });

                  // Set Items in eventData
                  eventData.Items = value;
                } catch (e) {
                  console.log(`Error processing Items: ${e.message}`);
                  eventData.Items = [];
                }
                return;
              }

              // For regular fields, handle the target path appropriately
              let finalPath = targetPath;
              if (targetPath.startsWith("evtData.")) {
                finalPath = targetPath.substring(8); // Remove "evtData." prefix
              }

              setNestedProperty(eventData, finalPath, value);
            }
          });

          // Create a unique key for this event based on identity and timestamp
          const eventKey = `${identity}_${timestamp}`;

          // If we already have an event with this identity and timestamp, merge them
          if (eventsMap.has(eventKey)) {
            const existingEvent = eventsMap.get(eventKey);

            // Merge the Items arrays if they exist
            if (eventData.Items && existingEvent.evtData.Items) {
              existingEvent.evtData.Items = [
                ...existingEvent.evtData.Items,
                ...eventData.Items,
              ];
            } else if (eventData.Items) {
              existingEvent.evtData.Items = eventData.Items;
            }

            // Merge other properties
            Object.entries(eventData).forEach(([key, value]) => {
              if (key !== "Items") {
                existingEvent.evtData[key] = value;
              }
            });
          } else {
            // If this is a new event, add it to the map
            eventsMap.set(eventKey, {
              identity: identity,
              ts: timestamp,
              type: "event",
              evtName: evtName, // Always "Charged"
              evtData: eventData,
            });

            totalEvents++;
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

module.exports = router;
