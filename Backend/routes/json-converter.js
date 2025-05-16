const express = require("express");
const multer = require("multer");
const { Transform } = require("stream");
const { createObjectCsvWriter } = require("csv-writer");
const readline = require("readline");
const AWS = require("aws-sdk");
const { PassThrough } = require("stream");
const path = require("path");

const router = express.Router();

// Initialize S3
const s3 = new AWS.S3();
const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET;
const OUTPUT_BUCKET = process.env.S3_OUTPUT_BUCKET;

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB limit
});

// Global variable to track conversion progress
const progressMap = new Map();

// SSE endpoint for progress updates
router.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const clientId = req.query.id || "default";

  // Send initial progress
  res.write(
    `data: ${JSON.stringify({
      progress: 0,
      status: "Waiting for processing to start",
    })}\n\n`
  );

  // Set up interval to send progress updates
  const intervalId = setInterval(() => {
    const progress = progressMap.get(clientId) || {
      progress: 0,
      status: "Initializing",
    };
    res.write(`data: ${JSON.stringify(progress)}\n\n`);

    if (progress.progress >= 100) {
      clearInterval(intervalId);
      // Keep connection open for a short time to ensure final update is received
      setTimeout(() => {
        res.end();
      }, 1000);
    }
  }, 1000);

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(intervalId);
  });
});

// Endpoint to handle file upload and conversion
router.post("/convert", upload.single("jsonFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const clientId = req.query.id || "default";
  progressMap.set(clientId, {
    progress: 0,
    status: "File received, starting conversion",
  });

  try {
    // Upload the JSON file to S3
    const timestamp = Date.now();
    const fileBuffer = req.file.buffer;
    const jsonKey = `json_${timestamp}${path.extname(req.file.originalname)}`;
    const csvKey = `converted_${timestamp}.csv`;

    // Upload the original JSON to S3
    await s3
      .upload({
        Bucket: UPLOAD_BUCKET,
        Key: jsonKey,
        Body: fileBuffer,
        ContentType: "application/json",
      })
      .promise();

    // Create a readable stream from the buffer for processing
    const bufferStream = new PassThrough();
    bufferStream.end(fileBuffer);

    // Check JSON file format
    const formatInfo = await checkJsonFormat(bufferStream, clientId);

    // Create a new stream for actual processing
    const processingStream = new PassThrough();
    processingStream.end(fileBuffer);

    if (formatInfo.format === "single-object") {
      await processSingleObjectSafely(processingStream, csvKey, clientId);
    } else if (formatInfo.format === "array") {
      await processJsonArraySafely(processingStream, csvKey, clientId);
    } else if (formatInfo.format === "line-delimited") {
      await processLineDelimitedJson(processingStream, csvKey, clientId);
    } else {
      throw new Error("Unsupported JSON format");
    }

    // Return success response with download URL
    res.json({
      success: true,
      downloadUrl: `/api/download/${csvKey}`,
      filename: csvKey,
    });
  } catch (error) {
    console.error("Error processing file:", error);
    progressMap.set(clientId, {
      progress: 0,
      status: "Error: " + error.message,
    });
    res.status(500).send("Error processing file: " + error.message);
  }
});

// Detect JSON format - array, single object, or line-delimited
async function checkJsonFormat(bufferStream, clientId) {
  return new Promise((resolve, reject) => {
    progressMap.set(clientId, {
      progress: 5,
      status: "Detecting JSON format...",
    });

    // Read just the first few bytes to determine the starting character
    const firstChunkPromise = new Promise((resolveFirst) => {
      bufferStream.once("readable", () => {
        const chunk = bufferStream.read(10) || bufferStream.read();
        resolveFirst(chunk ? chunk.toString() : "");
      });
    });

    firstChunkPromise
      .then(async (firstChunk) => {
        const startChar = firstChunk.trim()[0];

        if (startChar === "[") {
          // Likely JSON array
          resolve({ format: "array" });
        } else if (startChar === "{") {
          // Either single object or line-delimited
          const isLineDelimited = await checkIfLineDelimited(bufferStream);
          if (isLineDelimited) {
            resolve({ format: "line-delimited" });
          } else {
            resolve({ format: "single-object" });
          }
        } else {
          // Check if it's line-delimited JSON by examining first few lines
          const isLineDelimited = await checkIfLineDelimited(bufferStream);
          if (isLineDelimited) {
            resolve({ format: "line-delimited" });
          } else {
            reject(new Error("Unable to detect JSON format"));
          }
        }
      })
      .catch(reject);
  });
}

// Helper function to check if stream contains line-delimited JSON
async function checkIfLineDelimited(bufferStream) {
  // Create a new readable stream from the buffer content
  const newStream = new PassThrough();
  bufferStream.pipe(newStream);

  return new Promise((resolve) => {
    let lineCount = 0;
    let validJsonLines = 0;
    const maxLinesToCheck = 5;

    const rl = readline.createInterface({
      input: newStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (line.trim()) {
        lineCount++;
        try {
          JSON.parse(line.trim());
          validJsonLines++;
        } catch (e) {
          // Not a valid JSON line
        }
      }

      if (lineCount >= maxLinesToCheck) {
        rl.close();
      }
    });

    rl.on("close", () => {
      // If most lines are valid JSON objects, consider it line-delimited
      resolve(validJsonLines > 0 && validJsonLines >= lineCount * 0.5);
    });
  });
}

// Process a JSON array file safely using line-by-line approach
async function processJsonArraySafely(bufferStream, csvKey, clientId) {
  return new Promise(async (resolve, reject) => {
    try {
      progressMap.set(clientId, {
        progress: 10,
        status: "Analyzing JSON array structure...",
      });

      // Create CSV output stream to S3
      const csvOutputStream = new PassThrough();
      const uploadPromise = s3
        .upload({
          Bucket: OUTPUT_BUCKET,
          Key: csvKey,
          Body: csvOutputStream,
          ContentType: "text/csv",
        })
        .promise();

      // Extract array contents and process them
      const headerSet = new Set();
      let totalLines = 0;
      let inArray = false;
      let depth = 0;
      let objectBuffer = "";
      let currentLineNumber = 0;

      // Create new stream for processing
      const newBufferStream = new PassThrough();
      bufferStream.pipe(newBufferStream);

      // First pass: sample objects to get headers
      const streamReader = readline.createInterface({
        input: newBufferStream,
        crlfDelay: Infinity,
      });

      let objectCount = 0;
      const maxSampleObjects = 10; // Sample up to 10 objects to determine structure

      for await (const line of streamReader) {
        currentLineNumber++;

        // Process the line character by character to track array depth
        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (!inArray && char === "[") {
            inArray = true;
            continue;
          }

          if (!inArray) continue;

          if (char === "{") {
            depth++;
            objectBuffer += char;
          } else if (char === "}") {
            depth--;
            objectBuffer += char;

            if (depth === 0) {
              // We have a complete object
              try {
                const obj = JSON.parse(objectBuffer);
                extractHeaders(obj, headerSet);
                objectCount++;
                objectBuffer = "";

                if (objectCount >= maxSampleObjects) {
                  break;
                }
              } catch (e) {
                console.warn(
                  `Warning: Could not parse object at line ${currentLineNumber}`
                );
                objectBuffer = "";
              }
            }
          } else if (depth > 0) {
            objectBuffer += char;
          }
        }

        if (objectCount >= maxSampleObjects) {
          break;
        }
      }

      // If we couldn't extract headers, fall back to line-delimited processing
      if (headerSet.size === 0) {
        console.log(
          "Falling back to line-delimited processing for array format"
        );
        // Create a new stream from the buffer for line-delimited processing
        const newStream = new PassThrough();
        bufferStream.pipe(newStream);
        await processLineDelimitedJson(newStream, csvKey, clientId);
        resolve();
        return;
      }

      // Convert headers to array
      const headers = Array.from(headerSet);

      // Write CSV header
      csvOutputStream.write(
        headers.map((header) => `"${header}"`).join(",") + "\n"
      );

      // Second pass: process the full file with known headers
      progressMap.set(clientId, {
        progress: 20,
        status: "Processing array records...",
      });

      // Create a new stream for the second pass
      const secondPassStream = new PassThrough();
      bufferStream.pipe(secondPassStream);

      inArray = false;
      depth = 0;
      objectBuffer = "";
      currentLineNumber = 0;
      objectCount = 0;
      let batch = [];
      const batchSize = 1000;

      const fullStreamReader = readline.createInterface({
        input: secondPassStream,
        crlfDelay: Infinity,
      });

      for await (const line of fullStreamReader) {
        currentLineNumber++;

        // Process the line character by character to track array depth
        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (!inArray && char === "[") {
            inArray = true;
            continue;
          }

          if (!inArray) continue;

          if (char === "{") {
            depth++;
            objectBuffer += char;
          } else if (char === "}") {
            depth--;
            objectBuffer += char;

            if (depth === 0) {
              // We have a complete object
              try {
                const obj = JSON.parse(objectBuffer);
                const flatRecord = {};

                headers.forEach((header) => {
                  flatRecord[header] = getFlatValue(obj, header);
                });

                // Write CSV record
                const csvLine =
                  headers
                    .map((header) => `"${escapeCsvValue(flatRecord[header])}"`)
                    .join(",") + "\n";

                csvOutputStream.write(csvLine);
                objectCount++;
                objectBuffer = "";

                // Update progress periodically
                if (objectCount % 1000 === 0) {
                  const progress = Math.min(95, 20 + objectCount / 1000);
                  progressMap.set(clientId, {
                    progress,
                    status: `Processed ${objectCount} records`,
                  });
                }
              } catch (e) {
                console.warn(
                  `Warning: Could not parse object at line ${currentLineNumber}`
                );
                objectBuffer = "";
              }
            }
          } else if (depth > 0) {
            objectBuffer += char;
          }
        }
      }

      // End the CSV output stream
      csvOutputStream.end();

      // Wait for upload to complete
      await uploadPromise;

      progressMap.set(clientId, {
        progress: 100,
        status: `Conversion complete! Processed ${objectCount} records`,
      });
      resolve();
    } catch (error) {
      reject(new Error("Failed to process JSON array: " + error.message));
    }
  });
}

// Process a JSON file containing a single object with arrays of records
async function processSingleObjectSafely(bufferStream, csvKey, clientId) {
  try {
    progressMap.set(clientId, {
      progress: 10,
      status: "Processing single object JSON...",
    });

    // For large files, it's better to process it as line-delimited if possible
    // Create a new stream for scanning
    const scanStream = new PassThrough();
    bufferStream.pipe(scanStream);

    // First attempt: check if there are any array properties by scanning
    const scanner = readline.createInterface({
      input: scanStream,
      crlfDelay: Infinity,
    });

    let arrayPropertyFound = false;
    let arrayPropertyName = null;
    let lineNumber = 0;

    // Scan for array property in first ~20 lines
    for await (const line of scanner) {
      lineNumber++;

      // Look for array property indicators like "property": [
      const match = line.match(/"([^"]+)"\s*:\s*\[/);
      if (match) {
        arrayPropertyName = match[1];
        arrayPropertyFound = true;
        break;
      }

      if (lineNumber > 20) break;
    }

    // Create a new stream for processing
    const processStream = new PassThrough();
    bufferStream.pipe(processStream);

    if (arrayPropertyFound) {
      // Process with line-by-line approach focusing on the array property
      await processObjectWithArrayProperty(
        processStream,
        csvKey,
        clientId,
        arrayPropertyName
      );
    } else {
      // If no array property found, process as regular line-delimited
      await processLineDelimitedJson(processStream, csvKey, clientId);
    }

    return;
  } catch (error) {
    throw new Error("Failed to process single object JSON: " + error.message);
  }
}

// Process an object with a known array property
async function processObjectWithArrayProperty(
  bufferStream,
  csvKey,
  clientId,
  arrayPropertyName
) {
  return new Promise(async (resolve, reject) => {
    try {
      progressMap.set(clientId, {
        progress: 15,
        status: `Processing array property "${arrayPropertyName}"...`,
      });

      // Create CSV output stream to S3
      const csvOutputStream = new PassThrough();
      const uploadPromise = s3
        .upload({
          Bucket: OUTPUT_BUCKET,
          Key: csvKey,
          Body: csvOutputStream,
          ContentType: "text/csv",
        })
        .promise();

      // Extract array items one by one
      const headerSet = new Set();
      let inArrayProperty = false;
      let inArrayItem = false;
      let arrayDepth = 0;
      let itemDepth = 0;
      let itemBuffer = "";
      let recordCount = 0;

      // First scan to determine headers from sample items
      // Create a new stream for header extraction
      const headerStream = new PassThrough();
      bufferStream.pipe(headerStream);

      const reader = readline.createInterface({
        input: headerStream,
        crlfDelay: Infinity,
      });

      let lineNumber = 0;
      const maxSampleItems = 10;

      for await (const line of reader) {
        lineNumber++;

        // First check if this line contains the array property start
        if (!inArrayProperty) {
          const propMatch =
            line.includes(`"${arrayPropertyName}"`) && line.includes("[");
          if (propMatch) {
            inArrayProperty = true;
          }
          continue;
        }

        // Process characters to track depth and build items
        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (!inArrayItem && char === "{") {
            inArrayItem = true;
            itemDepth = 1;
            itemBuffer = "{";
            continue;
          }

          if (!inArrayItem) continue;

          if (char === "{") {
            itemDepth++;
            itemBuffer += char;
          } else if (char === "}") {
            itemDepth--;
            itemBuffer += char;

            if (itemDepth === 0) {
              // Complete item found
              try {
                const item = JSON.parse(itemBuffer);
                extractHeaders(item, headerSet);
                recordCount++;
                itemBuffer = "";
                inArrayItem = false;

                if (recordCount >= maxSampleItems) {
                  break;
                }
              } catch (e) {
                console.warn(
                  `Warning: Could not parse item at line ${lineNumber}: ${e.message}`
                );
                itemBuffer = "";
                inArrayItem = false;
              }
            }
          } else if (inArrayItem) {
            itemBuffer += char;
          }
        }

        if (recordCount >= maxSampleItems) {
          break;
        }
      }

      // Convert headers to array
      const headers = Array.from(headerSet);

      if (headers.length === 0) {
        throw new Error("Could not determine structure of array items");
      }

      // Write CSV header
      csvOutputStream.write(
        headers.map((header) => `"${header}"`).join(",") + "\n"
      );

      // Second pass: process all items with known headers
      progressMap.set(clientId, {
        progress: 25,
        status: `Starting full data processing...`,
      });

      // Create a new stream for the second pass
      const processStream = new PassThrough();
      bufferStream.pipe(processStream);

      inArrayProperty = false;
      inArrayItem = false;
      itemDepth = 0;
      itemBuffer = "";
      recordCount = 0;

      const fullReader = readline.createInterface({
        input: processStream,
        crlfDelay: Infinity,
      });

      lineNumber = 0;

      for await (const line of fullReader) {
        lineNumber++;

        // First check if this line contains the array property start
        if (!inArrayProperty) {
          const propMatch =
            line.includes(`"${arrayPropertyName}"`) && line.includes("[");
          if (propMatch) {
            inArrayProperty = true;
          }
          continue;
        }

        // Process characters to track depth and build items
        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (!inArrayItem && char === "{") {
            inArrayItem = true;
            itemDepth = 1;
            itemBuffer = "{";
            continue;
          }

          if (!inArrayItem) continue;

          if (char === "{") {
            itemDepth++;
            itemBuffer += char;
          } else if (char === "}") {
            itemDepth--;
            itemBuffer += char;

            if (itemDepth === 0) {
              // Complete item found
              try {
                const item = JSON.parse(itemBuffer);
                const flatRecord = {};

                headers.forEach((header) => {
                  flatRecord[header] = getFlatValue(item, header);
                });

                // Write CSV record
                const csvLine =
                  headers
                    .map((header) => `"${escapeCsvValue(flatRecord[header])}"`)
                    .join(",") + "\n";

                csvOutputStream.write(csvLine);
                recordCount++;

                // Update progress periodically
                if (recordCount % 1000 === 0) {
                  const progress = Math.min(95, 25 + recordCount / 1000);
                  progressMap.set(clientId, {
                    progress,
                    status: `Processed ${recordCount} records`,
                  });
                }

                itemBuffer = "";
                inArrayItem = false;
              } catch (e) {
                console.warn(
                  `Warning: Could not parse item at line ${lineNumber}: ${e.message}`
                );
                itemBuffer = "";
                inArrayItem = false;
              }
            }
          } else if (inArrayItem) {
            itemBuffer += char;
          }
        }
      }

      // End the CSV output stream
      csvOutputStream.end();

      // Wait for upload to complete
      await uploadPromise;

      progressMap.set(clientId, {
        progress: 100,
        status: `Conversion complete! Processed ${recordCount} records`,
      });
      resolve();
    } catch (error) {
      reject(
        new Error(
          "Failed to process object with array property: " + error.message
        )
      );
    }
  });
}

// Process line-delimited JSON (NDJSON/JSON Lines format)
async function processLineDelimitedJson(bufferStream, csvKey, clientId) {
  return new Promise((resolve, reject) => {
    progressMap.set(clientId, {
      progress: 10,
      status: "Processing line-delimited JSON...",
    });

    // Create CSV output stream to S3
    const csvOutputStream = new PassThrough();
    const uploadPromise = s3
      .upload({
        Bucket: OUTPUT_BUCKET,
        Key: csvKey,
        Body: csvOutputStream,
        ContentType: "text/csv",
      })
      .promise();

    // First pass: extract headers from the entire file
    const allHeaders = new Set();
    let recordCount = 0;

    progressMap.set(clientId, {
      progress: 15,
      status: "Analyzing entire file for complete structure...",
    });

    // Create a new stream for header extraction
    const headerStream = new PassThrough();
    bufferStream.pipe(headerStream);

    const headerReader = readline.createInterface({
      input: headerStream,
      crlfDelay: Infinity,
    });

    headerReader.on("line", (line) => {
      if (line.trim()) {
        try {
          // Handle lines that might be partial - skip if they don't parse
          let lineData = line.trim();

          // Add closing brace if it appears to be missing
          if (lineData.startsWith("{") && !lineData.endsWith("}")) {
            lineData += "}";
          }

          const record = JSON.parse(lineData);
          extractHeaders(record, allHeaders);
          recordCount++;

          // Update progress periodically
          if (recordCount % 10000 === 0) {
            progressMap.set(clientId, {
              progress: 15, // Stay at 15% during header analysis
              status: `Analyzed ${recordCount} records for headers (${allHeaders.size} unique fields found)`,
            });
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    });

    headerReader.on("close", async () => {
      try {
        // If no headers were found, try a different approach or fail
        if (allHeaders.size === 0) {
          csvOutputStream.end();
          return reject(
            new Error("Could not determine structure from JSON data")
          );
        }

        const headers = Array.from(allHeaders);

        progressMap.set(clientId, {
          progress: 30,
          status: `Found ${headers.length} unique fields. Starting conversion of ${recordCount} records...`,
        });

        // Write CSV header
        csvOutputStream.write(
          headers.map((header) => `"${header}"`).join(",") + "\n"
        );

        // Second pass: process all lines
        // Create a new stream for processing
        const processStream = new PassThrough();
        bufferStream.pipe(processStream);

        const rl = readline.createInterface({
          input: processStream,
          crlfDelay: Infinity,
        });

        let processedLines = 0;

        for await (const line of rl) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            try {
              // Handle lines that might be partial
              let lineData = trimmedLine;

              // Add closing brace if it appears to be missing
              if (lineData.startsWith("{") && !lineData.endsWith("}")) {
                lineData += "}";
              }

              const record = JSON.parse(lineData);
              const flatRecord = {};

              headers.forEach((header) => {
                flatRecord[header] = getFlatValue(record, header);
              });

              // Write CSV record
              const csvLine =
                headers
                  .map((header) => `"${escapeCsvValue(flatRecord[header])}"`)
                  .join(",") + "\n";

              csvOutputStream.write(csvLine);
              processedLines++;

              // Update progress periodically
              if (processedLines % 1000 === 0) {
                const progress =
                  30 + Math.min(65, (processedLines / recordCount) * 65);
                progressMap.set(clientId, {
                  progress,
                  status: `Processed ${processedLines} of ${recordCount} records (${Math.round(
                    (processedLines / recordCount) * 100
                  )}%)`,
                });
              }
            } catch (e) {
              // Skip invalid JSON lines
              console.warn("Skipped invalid JSON line:", e.message);
            }
          }
        }

        // End the CSV output stream
        csvOutputStream.end();

        // Wait for upload to complete
        await uploadPromise;

        progressMap.set(clientId, {
          progress: 100,
          status: `Conversion complete! Processed ${processedLines} records with ${headers.length} fields`,
        });
        resolve();
      } catch (error) {
        csvOutputStream.end();
        reject(
          new Error("Failed to process line-delimited JSON: " + error.message)
        );
      }
    });

    headerReader.on("error", (err) => {
      csvOutputStream.end();
      reject(
        new Error("Error reading line-delimited JSON file: " + err.message)
      );
    });
  });
}

// Extract all headers from a JSON object (including nested fields)
function extractHeaders(obj, headers, prefix = "") {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    // Handle array - we'll just keep the whole array as one field
    if (prefix) headers.add(prefix);
  } else {
    // Handle object
    for (const key in obj) {
      const value = obj[key];
      const newPrefix = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === "object") {
        // Recursively extract headers from nested objects
        extractHeaders(value, headers, newPrefix);
      } else {
        // Add the field to headers
        headers.add(newPrefix);
      }
    }
  }
}

// Get a flattened value from a nested object
function getFlatValue(obj, path) {
  if (!path) return "";

  // Handle dot notation for nested objects
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return "";
    current = current[part];
  }

  // Handle different types of values
  if (current === null || current === undefined) {
    return "";
  } else if (Array.isArray(current) || typeof current === "object") {
    // Convert objects and arrays to JSON strings
    try {
      return JSON.stringify(current);
    } catch (e) {
      return "[Complex Object]";
    }
  } else {
    return String(current);
  }
}

// Escape CSV values to prevent breaking the CSV format
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/"/g, '""');
}

module.exports = router;
