const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { Transform } = require("stream");
const { createObjectCsvWriter } = require("csv-writer");
const readline = require("readline");

const router = express.Router();

// Create uploads and downloads directories if they don't exist
const UPLOAD_FOLDER = path.join(__dirname, "../uploads");
const OUTPUT_FOLDER = path.join(__dirname, "../output");

if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: UPLOAD_FOLDER,
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `json_${timestamp}${ext}`);
  },
});

// Set up file size limits - 2GB limit
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
    const jsonFilePath = req.file.path;
    const csvFilename = `converted_${Date.now()}.csv`;
    const csvFilePath = path.join(OUTPUT_FOLDER, csvFilename);

    // Check JSON file format safely
    const formatInfo = await checkJsonFormat(jsonFilePath, clientId);

    if (formatInfo.format === "single-object") {
      await processSingleObjectSafely(jsonFilePath, csvFilePath, clientId);
    } else if (formatInfo.format === "array") {
      await processJsonArraySafely(jsonFilePath, csvFilePath, clientId);
    } else if (formatInfo.format === "line-delimited") {
      await processLineDelimitedJson(jsonFilePath, csvFilePath, clientId);
    } else {
      throw new Error("Unsupported JSON format");
    }

    // Clean up the temporary JSON file
    fs.unlink(jsonFilePath, (err) => {
      if (err) console.error("Error removing temp file:", err);
    });

    // Return success response with download URL
    res.json({
      success: true,
      downloadUrl: `/api/download/${csvFilename}`,
      filename: csvFilename,
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
async function checkJsonFormat(filePath, clientId) {
  return new Promise((resolve, reject) => {
    progressMap.set(clientId, {
      progress: 5,
      status: "Detecting JSON format...",
    });

    // Read just the first few bytes to determine the starting character
    fs.open(filePath, "r", (err, fd) => {
      if (err) {
        return reject(new Error("Failed to open file: " + err.message));
      }

      const buffer = Buffer.alloc(10);
      fs.read(fd, buffer, 0, 10, 0, (err, bytesRead) => {
        if (err) {
          fs.close(fd, () => {});
          return reject(new Error("Failed to read file: " + err.message));
        }

        // Close file descriptor
        fs.close(fd, () => {});

        const startChar = buffer.toString().trim()[0];

        if (startChar === "[") {
          // Likely JSON array
          resolve({ format: "array" });
        } else if (startChar === "{") {
          // Either single object or line-delimited - use readline to check
          checkIfLineDelimited(filePath)
            .then((isLineDelimited) => {
              if (isLineDelimited) {
                resolve({ format: "line-delimited" });
              } else {
                resolve({ format: "single-object" });
              }
            })
            .catch((err) => reject(err));
        } else {
          // Check if it's line-delimited JSON by examining first few lines
          checkIfLineDelimited(filePath)
            .then((isLineDelimited) => {
              if (isLineDelimited) {
                resolve({ format: "line-delimited" });
              } else {
                reject(new Error("Unable to detect JSON format"));
              }
            })
            .catch((err) => reject(err));
        }
      });
    });
  });
}

// Helper function to check if file contains line-delimited JSON
async function checkIfLineDelimited(filePath) {
  return new Promise((resolve) => {
    let lineCount = 0;
    let validJsonLines = 0;
    const maxLinesToCheck = 5;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
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
async function processJsonArraySafely(filePath, outputPath, clientId) {
  return new Promise(async (resolve, reject) => {
    try {
      progressMap.set(clientId, {
        progress: 10,
        status: "Analyzing JSON array structure...",
      });

      // Extract array contents and process them
      const headerSet = new Set();
      let totalLines = 0;
      let inArray = false;
      let depth = 0;
      let objectBuffer = "";
      let currentLineNumber = 0;

      // First pass: sample objects to get headers
      const streamReader = readline.createInterface({
        input: fs.createReadStream(filePath),
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
        await processLineDelimitedJson(filePath, outputPath, clientId);
        resolve();
        return;
      }

      // Convert headers to array
      const headers = Array.from(headerSet);

      // Set up CSV writer
      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: headers.map((header) => ({ id: header, title: header })),
        fieldDelimiter: ",",
        recordDelimiter: "\n",
        alwaysQuote: true,
      });

      // Second pass: process the full file with known headers
      progressMap.set(clientId, {
        progress: 20,
        status: "Processing array records...",
      });

      inArray = false;
      depth = 0;
      objectBuffer = "";
      currentLineNumber = 0;
      objectCount = 0;
      let batch = [];
      const batchSize = 1000;

      const fullStreamReader = readline.createInterface({
        input: fs.createReadStream(filePath),
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

                batch.push(flatRecord);
                objectCount++;
                objectBuffer = "";

                // Write batch if needed
                if (batch.length >= batchSize) {
                  await csvWriter.writeRecords(batch);
                  batch = [];

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

      // Write any remaining records
      if (batch.length > 0) {
        await csvWriter.writeRecords(batch);
      }

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
async function processSingleObjectSafely(filePath, outputPath, clientId) {
  try {
    progressMap.set(clientId, {
      progress: 10,
      status: "Processing single object JSON...",
    });

    // For large files, it's better to process it as line-delimited if possible
    // First attempt: check if there are any array properties by scanning
    const scanner = readline.createInterface({
      input: fs.createReadStream(filePath),
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

    if (arrayPropertyFound) {
      // Process with line-by-line approach focusing on the array property
      await processObjectWithArrayProperty(
        filePath,
        outputPath,
        clientId,
        arrayPropertyName
      );
    } else {
      // If no array property found, process as regular line-delimited
      await processLineDelimitedJson(filePath, outputPath, clientId);
    }

    return;
  } catch (error) {
    throw new Error("Failed to process single object JSON: " + error.message);
  }
}

// Process an object with a known array property
async function processObjectWithArrayProperty(
  filePath,
  outputPath,
  clientId,
  arrayPropertyName
) {
  return new Promise(async (resolve, reject) => {
    try {
      progressMap.set(clientId, {
        progress: 15,
        status: `Processing array property "${arrayPropertyName}"...`,
      });

      // Extract array items one by one
      const headerSet = new Set();
      let inArrayProperty = false;
      let inArrayItem = false;
      let arrayDepth = 0;
      let itemDepth = 0;
      let itemBuffer = "";
      let records = [];
      let recordCount = 0;

      // First scan to determine headers from sample items
      const reader = readline.createInterface({
        input: fs.createReadStream(filePath),
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

      // Set up CSV writer
      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: headers.map((header) => ({ id: header, title: header })),
        fieldDelimiter: ",",
        recordDelimiter: "\n",
        alwaysQuote: true,
      });

      // Second pass: process all items with known headers
      progressMap.set(clientId, {
        progress: 25,
        status: `Starting full data processing...`,
      });

      inArrayProperty = false;
      inArrayItem = false;
      itemDepth = 0;
      itemBuffer = "";
      recordCount = 0;
      let batch = [];
      const batchSize = 1000;

      const fullReader = readline.createInterface({
        input: fs.createReadStream(filePath),
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

                batch.push(flatRecord);
                recordCount++;

                // Write batch if needed
                if (batch.length >= batchSize) {
                  await csvWriter.writeRecords(batch);
                  batch = [];

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

      // Write any remaining records
      if (batch.length > 0) {
        await csvWriter.writeRecords(batch);
      }

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
async function processLineDelimitedJson(filePath, outputPath, clientId) {
  return new Promise((resolve, reject) => {
    progressMap.set(clientId, {
      progress: 10,
      status: "Processing line-delimited JSON...",
    });

    // First pass: extract headers from the entire file
    const allHeaders = new Set();
    let recordCount = 0;

    progressMap.set(clientId, {
      progress: 15,
      status: "Analyzing entire file for complete structure...",
    });

    const headerReader = readline.createInterface({
      input: fs.createReadStream(filePath),
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
          return reject(
            new Error("Could not determine structure from JSON data")
          );
        }

        const headers = Array.from(allHeaders);

        progressMap.set(clientId, {
          progress: 30,
          status: `Found ${headers.length} unique fields. Starting conversion of ${recordCount} records...`,
        });

        // Set up CSV writer
        const csvWriter = createObjectCsvWriter({
          path: outputPath,
          header: headers.map((header) => ({ id: header, title: header })),
          fieldDelimiter: ",",
          recordDelimiter: "\n",
          alwaysQuote: true,
        });

        // Second pass: process all lines
        const rl = readline.createInterface({
          input: fs.createReadStream(filePath),
          crlfDelay: Infinity,
        });

        let records = [];
        let processedLines = 0;
        const batchSize = 1000;

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

              records.push(flatRecord);
              processedLines++;

              // Process in batches
              if (records.length >= batchSize) {
                await csvWriter.writeRecords(records);
                records = [];

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

        // Write any remaining records
        if (records.length > 0) {
          await csvWriter.writeRecords(records);
        }

        progressMap.set(clientId, {
          progress: 100,
          status: `Conversion complete! Processed ${processedLines} records with ${headers.length} fields`,
        });
        resolve();
      } catch (error) {
        reject(
          new Error("Failed to process line-delimited JSON: " + error.message)
        );
      }
    });

    headerReader.on("error", (err) => {
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

module.exports = router;
