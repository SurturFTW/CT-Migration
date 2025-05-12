const express = require("express");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const { parse, stringify } = require("csv");

const { convertToEpoch } = require("../utils/dateUtils");

const router = express.Router();

const UPLOAD_FOLDER = path.join(__dirname, "../uploads");
const OUTPUT_FOLDER = path.join(__dirname, "../output");

router.post("/generate_manifest", async (req, res) => {
  try {
    const { accountName, columns, type, fileName, clientEmail } = req.body;

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
    const originalFilePath = path.join(UPLOAD_FOLDER, fileName);

    if (!fs.existsSync(originalFilePath)) {
      return res
        .status(400)
        .json({ error: `Uploaded file not found: ${fileName}` });
    }

    const folderName = `${accountName.replace(/[@.]/g, "_")}_${timestamp}`;
    const csvFilePrefix =
      type === "event" ? `event_${timestamp}` : `profile_${timestamp}`;
    const folderPath = path.join(OUTPUT_FOLDER, folderName);
    fs.mkdirSync(folderPath, { recursive: true });

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
    const manifestFileName = `${accountName}_${timestamp}.json`;
    const manifestPath = path.join(folderPath, manifestFileName);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));

    // Create a Set of columns to keep
    const columnsToKeep = new Set(columns.map((col) => col.csv_name));

    // Identify custom columns with default values
    const customColumns = columns.filter((col) => col.isCustom);
    console.log("Custom columns:", customColumns);

    // Process the CSV file with mapped columns and add custom columns
    const modifiedCsvPath = path.join(folderPath, `${csvFilePrefix}.csv`);
    const readStream = fs.createReadStream(originalFilePath);
    const writeStream = fs.createWriteStream(modifiedCsvPath);

    const parser = parse({ columns: true, cast: false });
    const stringifier = stringify({
      header: true,
      columns: Array.from(columnsToKeep), // Include all mapped columns including custom ones
    });

    // Pipe the streams and perform datetime conversion
    readStream
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
      });

    stringifier.pipe(writeStream);

    // Wait for CSV to finish writing before creating the ZIP
    writeStream.on("finish", () => {
      // console.log(`CSV file written successfully: ${modifiedCsvPath}`);

      // Create ZIP file only after CSV is fully written
      const zipPath = path.join(OUTPUT_FOLDER, `${folderName}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(output);

      // Add files to archive with updated manifest name
      archive.file(manifestPath, { name: `${folderName}/${manifestFileName}` });
      archive.file(modifiedCsvPath, {
        name: `${folderName}/${csvFilePrefix}.csv`,
      });

      // Handle archive errors
      archive.on("error", (err) => {
        console.error("Error creating ZIP archive:", err);
        return res
          .status(500)
          .json({ error: "Error creating ZIP archive", details: err.message });
      });

      // Finalize the archive
      archive.finalize();

      // Wait for ZIP creation to complete before responding
      output.on("close", () => {
        console.log(`ZIP file created successfully: ${zipPath}`);
        res.json({
          // Updated manifest URL path
          manifest_url: `/api/download/${folderName}/${manifestFileName}`,
          csv_url: `/api/download/${folderName}/${csvFilePrefix}.csv`,
          zip_url: `/api/download/${folderName}.zip`,
        });
      });
    });
  } catch (error) {
    console.error("Error generating manifest:", error);
    res
      .status(500)
      .json({ error: "Error generating manifest", details: error.message });
  }
});

module.exports = router;
