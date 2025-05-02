const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

// Route to list all S3 buckets
router.post("/list-s3-buckets", async (req, res) => {
  try {
    const { region, accessKey, secretKey } = req.body;

    // Configure AWS
    AWS.config.update({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region: region,
    });

    // Create S3 service object
    const s3 = new AWS.S3();

    // List buckets
    s3.listBuckets((err, data) => {
      if (err) {
        console.error("Error listing buckets:", err);
        return res.status(500).json({
          success: false,
          error: `Error listing buckets: ${err.message}`,
        });
      }

      const buckets = data.Buckets.map((bucket) => ({
        name: bucket.Name,
        creationDate: bucket.CreationDate,
      }));

      res.json({
        success: true,
        buckets: buckets,
      });
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: `Error listing buckets: ${error.message}`,
    });
  }
});

// Route to list files in a bucket
router.post("/list-s3-files", async (req, res) => {
  try {
    const { region, bucket, accessKey, secretKey } = req.body;

    // Configure AWS
    AWS.config.update({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region: region,
    });

    // Create S3 service object
    const s3 = new AWS.S3();

    // Set up parameters to list only CSV files
    const params = {
      Bucket: bucket,
      Delimiter: "/",
    };

    // List objects in bucket
    s3.listObjectsV2(params, (err, data) => {
      if (err) {
        console.error("Error listing files:", err);
        return res.status(500).json({
          success: false,
          error: `Error listing files: ${err.message}`,
        });
      }

      // Filter for CSV files only
      const files = data.Contents.filter((item) =>
        item.Key.toLowerCase().endsWith(".csv")
      ).map((item) => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
      }));

      res.json({
        success: true,
        files: files,
      });
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: `Error listing files: ${error.message}`,
    });
  }
});

// Route to fetch files from S3
router.post("/fetch-from-s3", async (req, res) => {
  try {
    const { region, bucket, filePath, accessKey, secretKey } = req.body;

    // Configure AWS
    AWS.config.update({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      region: region,
    });

    const s3 = new AWS.S3();
    const params = {
      Bucket: bucket,
      Key: filePath,
    };

    // Create a unique local filepath
    const timestamp = new Date().getTime();
    const filename = path.basename(filePath);
    const localFilePath = path.join(
      __dirname,
      "..",
      "uploads",
      `${filename}_${timestamp}_.csv`
    );

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const headers = [];
    let rowCount = 0;

    // Stream directly from S3 and process CSV
    s3.getObject(params)
      .createReadStream()
      .pipe(csv())
      .on("headers", (headerList) => {
        headers.push(...headerList);
      })
      .on("data", () => {
        rowCount++;
      })
      .on("end", () => {
        res.json({
          success: true,
          message: "File successfully fetched from S3",
          filepath: localFilePath,
          filename: filename,
          headers: headers,
          rowCount: rowCount,
        });
      })
      .on("error", (err) => {
        console.error("Error processing CSV:", err);
        res.status(500).json({
          success: false,
          error: `Error processing CSV file: ${err.message}`,
        });
      });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: `Error processing S3 request: ${error.message}`,
    });
  }
});

module.exports = router;
