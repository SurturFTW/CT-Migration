const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");
const csv = require("csv-parser");
const { PassThrough } = require("stream");

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

    // S3 client for source bucket
    const sourceS3 = new AWS.S3();

    // S3 client for our app bucket (using environment credentials)
    const appS3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || "us-east-1",
    });

    const sourceParams = {
      Bucket: bucket,
      Key: filePath,
    };

    // Extract filename from path
    const filename = filePath.split("/").pop();

    // Generate a unique key for our upload bucket
    const timestamp = new Date().getTime();
    const destinationKey = `${filename}_${timestamp}.csv`;

    let csvContent = "";
    const headers = [];
    let rowCount = 0;
    let sampleRows = [];

    try {
      // Get the file from source S3
      const s3Stream = sourceS3.getObject(sourceParams).createReadStream();

      // Create a PassThrough stream to collect the file content
      const contentCollector = new PassThrough();

      s3Stream.pipe(contentCollector);

      // Process the CSV to extract headers and row count
      s3Stream
        .pipe(csv())
        .on("headers", (headerList) => {
          headers.push(...headerList);
        })
        .on("data", (data) => {
          rowCount++;
          // Collect sample rows (limit to 100 for memory considerations)
          if (sampleRows.length < 100) {
            sampleRows.push(data);
          }
        })
        .on("end", async () => {
          try {
            // Get the collected content
            csvContent = await streamToString(contentCollector);

            // Upload to our app's S3 bucket
            const uploadParams = {
              Bucket: process.env.S3_UPLOAD_BUCKET,
              Key: destinationKey,
              Body: csvContent,
              ContentType: "text/csv",
            };

            await appS3.upload(uploadParams).promise();

            // Return success response
            res.json({
              success: true,
              message: "File successfully fetched and stored in S3",
              filename: destinationKey,
              s3Key: destinationKey, // Key in our app's bucket
              headers: headers,
              rowCount: rowCount,
              csvContent: csvContent,
              sampleRows: sampleRows,
            });
          } catch (err) {
            console.error("Error uploading to app S3 bucket:", err);
            res.status(500).json({
              success: false,
              error: `Error uploading to app S3: ${err.message}`,
            });
          }
        });
    } catch (err) {
      console.error("Error fetching from source S3:", err);
      res.status(500).json({
        success: false,
        error: `Error fetching from source S3: ${err.message}`,
      });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: `Error processing S3 request: ${error.message}`,
    });
  }
});

// Helper function to convert a stream to a string
function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

module.exports = router;
