import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

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
    // Changed from "/json_converter" to "/convert"
    const response = await api.post("/convert", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
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
export const validateCSVData = async (formData) => {
  try {
    console.log("Validating CSV data...");

    const response = await fetch(`${API_URL}/validate_csv`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Server error");
    }

    const data = await response.json();
    console.log("Validation response:", data);

    return data;
  } catch (error) {
    console.error("Error validating CSV:", error);
    throw error;
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

export default api;
