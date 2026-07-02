const express = require("express");
const path = require("path");
const fs = require("fs");
const { parse, stringify } = require("csv");
const archiver = require("archiver");

const { convertToEpoch } = require("../utils/dateUtils");
const { OUTPUT_FOLDER, ensureDir } = require("../utils/storage");

const router = express.Router();

ensureDir(OUTPUT_FOLDER);

router.post("/generate_manifest", async (req, res) => {
  try {
    const {
      accountName,
      columns,
      type,
      fileName,
      clientEmail,
      filePath,
      identityColumn,
    } = req.body;

    if (
      !accountName ||
      !columns ||
      columns.length === 0 ||
      !fileName ||
      !clientEmail
    ) {
      return res
        .status(400)
        .json({ error: "Missing required data in the request" });
    }

    const timestamp = Date.now();

    // Extract the valid entries filename from the request
    // This should be the path to the valid entries CSV after validation
    const validEntriesFile = req.body.validEntriesFile;

    if (!validEntriesFile) {
      return res
        .status(400)
        .json({ error: "Valid entries file path is missing" });
    }

    // Check if the valid entries file exists locally
    const validEntriesPath = path.join(
      OUTPUT_FOLDER,
      path.basename(validEntriesFile.replace("/api/download/", ""))
    );

    if (!fs.existsSync(validEntriesPath)) {
      return res.status(400).json({
        error: `Valid entries file not found: ${validEntriesFile}`,
      });
    }

    const folderName = `${accountName.replace(/[@.]/g, "_")}_${timestamp}`;
    const csvFilePrefix =
      type === "event" ? `event_${timestamp}` : `profile_${timestamp}`;

    // Create manifest object
    const manifest = {
      fileName: `${csvFilePrefix}.csv`,
      type: type,
      columns: columns.reduce((acc, col) => {
        acc[col.csv_name] = {
          ctName: col.clevertap_name,
          dataType: col.type.toUpperCase(),
        };
        return acc;
      }, {}),
      clientEmail: clientEmail,
    };

    // Use the same naming convention for manifest file
    const manifestFileName = `${accountName}_${timestamp}.manifest`;

    const bundleDir = path.join(OUTPUT_FOLDER, folderName);
    ensureDir(bundleDir);

    // Write the manifest file directly to disk
    fs.writeFileSync(
      path.join(bundleDir, manifestFileName),
      JSON.stringify(manifest, null, 4)
    );

    // Create a Set of columns to keep
    const columnsToKeep = new Set(columns.map((col) => col.csv_name));

    // Identify custom columns with default values
    const customColumns = columns.filter((col) => col.isCustom);

    // Process the validated CSV file with mapped columns and add custom columns
    const csvOutputPath = path.join(bundleDir, `${csvFilePrefix}.csv`);
    const csvOutputStream = fs.createWriteStream(csvOutputPath);

    const csvWritePromise = new Promise((resolve, reject) => {
      csvOutputStream.on("finish", resolve);
      csvOutputStream.on("error", reject);
    });

    // Create CSV stringifier for the output
    const stringifier = stringify({
      header: true,
      columns: Array.from(columnsToKeep), // Include all mapped columns including custom ones
    });

    // Pipe stringifier to the local output file
    stringifier.pipe(csvOutputStream);

    // Read the VALID ENTRIES file from disk and process it
    const validEntriesReadStream = fs.createReadStream(validEntriesPath);

    // Parse the input CSV
    const parser = parse({ columns: true, cast: false });

    // Set up the streaming pipeline and processing
    validEntriesReadStream
      .pipe(parser)
      .on("data", (row) => {
        // Convert datetime values in each row
        const convertedRow = {};

        // Process original columns that are kept
        for (const [key, value] of Object.entries(row)) {
          if (
            columnsToKeep.has(key) &&
            !customColumns.some((col) => col.csv_name === key)
          ) {
            // Find the corresponding clevertap_name for this column
            const colMapping = columns.find((col) => col.csv_name === key);
            const clevertapName = colMapping ? colMapping.clevertap_name : null;

            // Use clevertap_name for conversion to determine if it's a "ts" field
            convertedRow[key] = convertToEpoch(value, clevertapName);
          }
        }

        // Add custom columns with their default values
        customColumns.forEach((customCol) => {
          // Apply the default value for this custom column
          const defaultValue = customCol.value || "";

          // Handle different data types for the custom value
          let formattedValue = defaultValue;

          if (customCol.type === "boolean") {
            formattedValue =
              defaultValue.toLowerCase() === "true" ? "true" : "false";
          } else if (customCol.type === "integer") {
            formattedValue = isNaN(parseInt(defaultValue))
              ? "0"
              : parseInt(defaultValue).toString();
          } else if (customCol.type === "float") {
            formattedValue = isNaN(parseFloat(defaultValue))
              ? "0.0"
              : parseFloat(defaultValue).toString();
          }

          convertedRow[customCol.csv_name] = formattedValue;
        });

        stringifier.write(convertedRow);
      })
      .on("end", () => {
        stringifier.end();
      })
      .on("error", (err) => {
        console.error("Error processing CSV:", err);
        csvOutputStream.end();
      });

    // Wait for the CSV file to finish writing
    await csvWritePromise;

    // Now build the ZIP bundle from the local manifest + CSV files
    const zipPath = path.join(OUTPUT_FOLDER, `${folderName}.zip`);
    const zipOutputStream = fs.createWriteStream(zipPath);

    const zipWritePromise = new Promise((resolve, reject) => {
      zipOutputStream.on("close", resolve);
      zipOutputStream.on("error", reject);
    });

    // Create the archiver
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(zipOutputStream);

    // Add the manifest and CSV files (already on disk) to the archive
    archive.file(path.join(bundleDir, manifestFileName), {
      name: `${folderName}/${manifestFileName}`,
    });
    archive.file(csvOutputPath, {
      name: `${folderName}/${csvFilePrefix}.csv`,
    });

    // Finalize the archive
    archive.finalize();

    // Wait for the ZIP file to finish writing
    await zipWritePromise;

    console.log(`Manifest, CSV, and ZIP files created successfully`);

    // Respond with the URLs
    res.json({
      manifest_url: `/api/download/${folderName}/${manifestFileName}`,
      csv_url: `/api/download/${folderName}/${csvFilePrefix}.csv`,
      zip_url: `/api/download/${folderName}.zip`,
    });
  } catch (error) {
    console.error("Error generating manifest:", error);
    res
      .status(500)
      .json({ error: "Error generating manifest", details: error.message });
  }
});

module.exports = router;
