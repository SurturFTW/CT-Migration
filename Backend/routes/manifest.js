const express = require("express");
const path = require("path");
const { parse, stringify } = require("csv");
const AWS = require("aws-sdk");
const { PassThrough } = require("stream");
const archiver = require("archiver");

const { convertToEpoch } = require("../utils/dateUtils");

const router = express.Router();

// Initialize S3
const s3 = new AWS.S3();
const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET;
const OUTPUT_BUCKET = process.env.S3_OUTPUT_BUCKET;

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

    // Check if the valid entries file exists in S3
    try {
      await s3
        .headObject({
          Bucket: OUTPUT_BUCKET,
          Key: validEntriesFile.replace("/api/download/", ""),
        })
        .promise();
    } catch (error) {
      return res.status(400).json({
        error: `Valid entries file not found in S3: ${validEntriesFile}`,
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
    const manifestFileName = `${accountName}_${timestamp}.json`;

    // Upload manifest directly to S3 without creating temp file
    await s3
      .upload({
        Bucket: OUTPUT_BUCKET,
        Key: `${folderName}/${manifestFileName}`,
        Body: JSON.stringify(manifest, null, 4),
        ContentType: "application/json",
      })
      .promise();

    // Create a Set of columns to keep
    const columnsToKeep = new Set(columns.map((col) => col.csv_name));

    // Identify custom columns with default values
    const customColumns = columns.filter((col) => col.isCustom);
    // console.log("Custom columns:", customColumns);

    // Process the validated CSV file with mapped columns and add custom columns
    // Create a CSV output stream that will be sent directly to S3
    const csvOutputStream = new PassThrough();

    // Set up the S3 upload for the CSV
    const csvUploadPromise = s3
      .upload({
        Bucket: OUTPUT_BUCKET,
        Key: `${folderName}/${csvFilePrefix}.csv`,
        Body: csvOutputStream,
        ContentType: "text/csv",
      })
      .promise();

    // Create CSV stringifier for the output
    const stringifier = stringify({
      header: true,
      columns: Array.from(columnsToKeep), // Include all mapped columns including custom ones
    });

    // Pipe stringifier to the output stream that goes to S3
    stringifier.pipe(csvOutputStream);

    // Get the VALID ENTRIES file from S3 and process it
    const s3InputStream = s3
      .getObject({
        Bucket: OUTPUT_BUCKET,
        Key: validEntriesFile.replace("/api/download/", ""),
      })
      .createReadStream();

    // Parse the input CSV
    const parser = parse({ columns: true, cast: false });

    // Set up the streaming pipeline and processing
    s3InputStream
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

    // Wait for CSV upload to complete
    await csvUploadPromise;

    // Now create and upload the ZIP file directly to S3
    const zipOutputStream = new PassThrough();

    // Set up the S3 upload for the ZIP
    const zipUploadPromise = s3
      .upload({
        Bucket: OUTPUT_BUCKET,
        Key: `${folderName}.zip`,
        Body: zipOutputStream,
        ContentType: "application/zip",
      })
      .promise();

    // Create the archiver
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(zipOutputStream);

    // Add the manifest file to the archive
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 4));
    archive.append(manifestBuffer, {
      name: `${folderName}/${manifestFileName}`,
    });

    // Get the CSV file we just uploaded and add it to the archive
    const csvResponse = await s3
      .getObject({
        Bucket: OUTPUT_BUCKET,
        Key: `${folderName}/${csvFilePrefix}.csv`,
      })
      .promise();

    archive.append(csvResponse.Body, {
      name: `${folderName}/${csvFilePrefix}.csv`,
    });

    // Finalize the archive
    archive.finalize();

    // Wait for the ZIP upload to complete
    await zipUploadPromise;

    console.log(
      `Manifest, CSV, and ZIP files created and uploaded successfully`
    );

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
