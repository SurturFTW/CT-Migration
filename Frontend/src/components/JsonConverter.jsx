import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { convertJsonToCsv } from "../services/api";

import Header from "./Header";
import Footer from "./Footer";
import FileUploader from "./FileUploader"; // Import the new component

function JsonConverter() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [convertDisabled, setConvertDisabled] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [clientId] = useState(`client_${Date.now()}`); // Unique client ID for SSE

  const eventSourceRef = useRef(null);

  const headerRightContent = (
    <div className="flex items-center space-x-4">
      <button
        onClick={() => navigate("/dashboard")}
        className="border border-black text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 transition"
      >
        Back to Dashboard
      </button>
    </div>
  );

  // Display error message
  const showError = useCallback((message) => {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage(null);
    }, 8000);
  }, []);

  // Display success message
  const showSuccessMessage = useCallback((message) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  }, []);

  // Handle file selection from the FileUploader component
  const handleFileSelect = useCallback((selectedFile) => {
    setFile(selectedFile);
    setConvertDisabled(!selectedFile);
  }, []);

  // Connect to SSE for progress updates
  useEffect(() => {
    // Clean up event source on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Handle JSON file conversion
  const handleJsonConversion = async () => {
    if (!file) {
      showError("Please select a JSON file first");
      return;
    }

    try {
      // Show progress elements
      setShowProgress(true);
      setShowResult(false);
      setConvertDisabled(true);

      // Reset progress indicators
      setProgress(0);
      setStatus("Starting conversion...");

      // Create form data for file upload
      const formData = new FormData();
      formData.append("jsonFile", file);

      setStatus("Uploading file...");
      setProgress(20);

      // Use your existing API service
      const response = await convertJsonToCsv(formData);

      setProgress(100);
      setStatus("Conversion completed!");

      // Handle the response
      if (response.success) {
        // Create download URL for the converted file
        const apiUrl =
          process.env.REACT_APP_API_URL || "http://localhost:5000/api";
        const downloadUrl = `${apiUrl.replace("/api", "")}/downloads/${
          response.filename
        }`;
        setDownloadUrl(downloadUrl);
        setDownloadFilename(response.filename);

        // Show success
        setShowResult(true);
        showSuccessMessage("File converted successfully!");
      } else {
        throw new Error(response.error || "Error converting file");
      }
    } catch (error) {
      console.error("Conversion error:", error);
      showError("Error converting file: " + (error.message || "Unknown error"));
    } finally {
      setConvertDisabled(false);
    }
  };

  // Clear file selection and reset state
  const handleClearFile = () => {
    setFile(null);
    setConvertDisabled(true);
    setShowProgress(false);
    setShowResult(false);
    setDownloadUrl("");
    setDownloadFilename("");
  };

  // Handle file download cleanup
  useEffect(() => {
    // Clean up the object URL when component unmounts or URL changes
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  return (
    <div className="min-h-screen bg-white text-gray-700 flex flex-col">
      {/* Header */}
      <Header rightContent={headerRightContent} />

      <div className="max-w-4xl mx-auto p-8 space-y-8 w-full">
        <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300 transition-all">
          <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
            <i className="fas fa-file-upload text-black mr-3"></i>Upload JSON
            File
          </h2>

          {/* Error or Success Messages */}
          {errorMessage && (
            <div className="bg-gray-100 border-l-4 border-black text-gray-700 p-4 mb-4 rounded">
              <div className="flex items-center">
                <div className="text-lg mr-2">
                  <i className="fas fa-exclamation-circle"></i>
                </div>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-gray-100 border-l-4 border-black text-gray-700 p-4 mb-4 rounded">
              <div className="flex items-center">
                <div className="text-lg mr-2">
                  <i className="fas fa-check-circle"></i>
                </div>
                <p>{successMessage}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Replace the old file upload with our new component */}
            <FileUploader
              accept=".json,application/json"
              maxSize={2048}
              onFileSelect={handleFileSelect}
              onError={showError}
              supportedFormats="JSON only"
              disabled={showProgress}
            />

            <button
              onClick={handleJsonConversion}
              className={`w-full bg-gray-800 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center font-medium ${
                convertDisabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={convertDisabled}
            >
              <i className="fas fa-sync-alt mr-2"></i>Convert to CSV
            </button>

            {showProgress && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-800">
                  Conversion Progress
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gray-800 text-xs text-white text-center leading-4"
                    style={{ width: `${progress}%` }}
                  >
                    {`${Math.round(progress)}%`}
                  </div>
                </div>
                <div className="text-sm text-gray-600 italic">{status}</div>
              </div>
            )}

            {showResult && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-800">
                  Conversion Complete
                </h3>
                <p className="text-gray-600">
                  Your file has been successfully converted!
                </p>
                <a
                  href={downloadUrl}
                  download={downloadFilename}
                  className="block w-full bg-gray-800 text-white text-center py-3 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center font-medium"
                >
                  <i className="fas fa-download mr-2"></i>Download CSV
                </a>
                <button
                  onClick={handleClearFile}
                  className="block w-full border border-gray-400 text-gray-700 text-center py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center font-medium mt-2"
                >
                  <i className="fas fa-redo mr-2"></i>Convert Another File
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default JsonConverter;
