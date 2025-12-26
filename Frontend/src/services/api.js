import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001/api";

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// JSON Converter API calls
export const convertJsonToCsv = async (formData) => {
  try {
    const response = await api.post("/convert", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 3600000, // 1 hour for large file processing
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// SFTP Generator API calls
export const uploadCSV = async (formData, onUploadProgress) => {
  try {
    const response = await api.post("/upload_csv", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: onUploadProgress,
      // Increase timeout for large files (default is too short)
      timeout: 3600000, // 1 hour
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// Validate CSV data
export const validateCSVMapping = async (formData, progressCallback) => {
  try {
    const response = await api.post("/validate_csv", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: progressCallback,
    });

    return response.data;
  } catch (error) {
    console.error("Validation error:", error);

    // Extract error message from response if available
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Error validating CSV";

    throw new Error(errorMessage);
  }
};

export const generateFiles = async (payload) => {
  try {
    const response = await api.post("/generate_manifest", payload, {
      timeout: 3600000, // 1 hour for large file processing
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const downloadFile = (url, type, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      if (!url) {
        throw new Error(`No URL provided for ${type} download`);
      }

      const { accountName = "", dataType = "" } = options;

      let downloadUrl;
      let fileName;
      const timestamp = new Date().getTime();

      // Format the URL properly based on what the server expects
      if (url.startsWith("http")) {
        downloadUrl = url;
      } else if (url.startsWith("/")) {
        downloadUrl = `${API_URL.replace("/api", "")}${url}`;
      } else {
        downloadUrl = `${API_URL}/download/${url}`;
      }

      // Set appropriate filename based on type and include timestamp
      switch (type) {
        case "manifest":
          fileName = `${accountName}_manifest_${timestamp}.json`;
          break;
        case "csv":
          fileName = `${accountName}_data_${timestamp}.csv`;
          break;
        case "zip":
          fileName = `${accountName}_${dataType}_${timestamp}.zip`;
          break;
        case "validation_log":
          fileName = `validation_log_${timestamp}.csv`;
          break;
        case "valid_entries":
          fileName = `valid_entries_${timestamp}.csv`;
          break;
        default:
          fileName = url.split("/").pop();
      }

      console.log("Downloading file from:", downloadUrl);

      // Create a link element and trigger the download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      resolve(true);
    } catch (error) {
      console.error("Download error:", error);
      reject(error);
    }
  });
};

// S3 Related API calls
export const listS3Buckets = async (credentials) => {
  try {
    const response = await api.post("/list-s3-buckets", {
      region: credentials.region,
      accessKey: credentials.accessKey,
      secretKey: credentials.secretKey,
    });

    if (response.data && response.data.buckets) {
      return {
        success: true,
        buckets: response.data.buckets,
      };
    } else {
      throw new Error("Invalid response format from S3");
    }
  } catch (error) {
    console.error("S3 Error:", error);
    throw error.response?.data || error;
  }
};

export const listS3Files = async (s3Config) => {
  try {
    const response = await api.post("/list-s3-files", s3Config);
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const fetchFromS3 = async (s3Config) => {
  try {
    const response = await api.post("/fetch-from-s3", s3Config, {
      timeout: 3600000, // 1 hour timeout for large files
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const cleanupS3File = async (filepath) => {
  try {
    const response = await api.post("/cleanup", { filepath });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// CleverTap Charged Event Upload API calls
export const previewEvents = async (formData) => {
  try {
    const response = await api.post("/preview_event", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// In your api.js service file
export const uploadEventsWithProgress = async (formData, onProgress) => {
  const controller = new AbortController();
  const { signal } = controller;

  const response = await fetch("/api/upload_event", {
    method: "POST",
    body: formData,
    signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload events");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let result = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    // Accumulate the data
    const chunk = decoder.decode(value, { stream: true });
    result += chunk;

    // Try to parse progress updates
    try {
      if (chunk.includes("progress:")) {
        const progressMatch = chunk.match(/progress:\s*(\d+)/);
        if (progressMatch && progressMatch[1]) {
          const progress = parseInt(progressMatch[1], 10);
          onProgress(null, progress);
        }
      }

      // Look for log messages
      const logMatches = chunk.match(/📦|🚀|✅|❌|⚠️|📊|⏱️/g);
      if (logMatches) {
        onProgress(chunk.trim(), null);
      }
    } catch (e) {
      console.warn("Error parsing progress:", e);
    }
  }

  // Parse the final result
  try {
    return JSON.parse(result);
  } catch (e) {
    console.error("Error parsing result:", e);
    throw new Error("Invalid response from server");
  }
};

export default api;
