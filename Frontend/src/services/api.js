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
    const response = await api.post("/json_converter", formData, {
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

export const validateCSVData = async (formData, onUploadProgress) => {
  try {
    const response = await api.post("/validate_csv", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: onUploadProgress,
      timeout: 3600000, // 1 hour
    });
    return response.data;
  } catch (error) {
    console.error("Validation API error:", error);
    throw error.response?.data || error;
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

export default api;
