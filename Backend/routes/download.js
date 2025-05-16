const express = require("express");
const AWS = require("aws-sdk");
const { PassThrough } = require("stream");

const router = express.Router();

// Initialize S3
const s3 = new AWS.S3();
const OUTPUT_BUCKET = process.env.S3_OUTPUT_BUCKET;

router.get("/download/:filename", async (req, res) => {
  try {
    const fileKey = req.params.filename;

    const params = {
      Bucket: OUTPUT_BUCKET,
      Key: fileKey,
    };

    // Check if the file exists in S3
    try {
      await s3.headObject(params).promise();
    } catch (error) {
      if (error.code === "NotFound") {
        return res.status(404).json({ error: "File not found" });
      }
      throw error; // Re-throw other errors
    }

    // Get the file from S3
    const s3Object = await s3.getObject(params).promise();

    // Set the appropriate headers
    res.setHeader("Content-Length", s3Object.ContentLength);
    res.setHeader(
      "Content-Type",
      s3Object.ContentType || "application/octet-stream"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileKey}"`);

    // Send the file to the client
    res.send(s3Object.Body);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ error: "Error downloading file" });
  }
});

// Support for downloading from nested folder paths in S3
router.get("/download/:folder/:filename", async (req, res) => {
  try {
    const folderName = req.params.folder;
    const fileName = req.params.filename;
    const fileKey = `${folderName}/${fileName}`;

    const params = {
      Bucket: OUTPUT_BUCKET,
      Key: fileKey,
    };

    // Check if the file exists in S3
    try {
      await s3.headObject(params).promise();
    } catch (error) {
      if (error.code === "NotFound") {
        return res.status(404).json({ error: "File not found" });
      }
      throw error; // Re-throw other errors
    }

    // Get the file from S3
    const s3Object = await s3.getObject(params).promise();

    // Set the appropriate headers
    res.setHeader("Content-Length", s3Object.ContentLength);
    res.setHeader(
      "Content-Type",
      s3Object.ContentType || "application/octet-stream"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // Send the file to the client
    res.send(s3Object.Body);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ error: "Error downloading file" });
  }
});

module.exports = router;
