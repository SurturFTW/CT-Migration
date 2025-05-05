import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { convertJsonToCsv } from "../services/api";

import Header from "./common/Header";
import Footer from "./common/Footer";
import FileUploader from "./common/FileUploader";
import Dropdown from "./common/Dropdown";
import AlertMessage from "./common/AlertMessage";

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
  // const [clientId] = useState(`client_${Date.now()}`);

  const [clientEmail] = useState(localStorage.getItem("email") || "");
  const [accountName] = useState(localStorage.getItem("accountName"));

  const eventSourceRef = useRef(null);

  const headerRightContent = (
    <div className="flex items-center space-x-4">
      <button
        onClick={() => navigate("/dashboard")}
        className="border border-black text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 transition"
      >
        Back to Dashboard
      </button>

      <Dropdown
        trigger={
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-black font-bold">
              {clientEmail.charAt(0).toUpperCase()}
            </div>
            <i className="fas fa-chevron-down text-gray-500"></i>
          </div>
        }
      >
        <ul className="py-2">
          <li className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-default">
            <i className="fas fa-user mr-2 text-gray-500"></i>
            <span className="font-medium">Account:</span> {accountName}
          </li>
          <li className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-default">
            <i className="fas fa-envelope mr-2 text-gray-500"></i>
            <span className="font-medium">Email:</span> {clientEmail}
          </li>
          <hr className="my-2 border-gray-200" />

          <li
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black cursor-pointer"
            onClick={() => {
              // Clear user data from localStorage
              localStorage.removeItem("accountName");
              localStorage.removeItem("email");

              navigate("/login");
            }}
          >
            <i className="fas fa-sign-out-alt mr-2 text-gray-500"></i>
            Sign Out
          </li>
        </ul>
      </Dropdown>
    </div>
  );

  // Display error message
  const showError = useCallback((message) => {
    setErrorMessage(message);
  }, []);

  // Display success message
  const showSuccessMessage = useCallback((message) => {
    setSuccessMessage(message);
  }, []);

  // Handle file selection from the FileUploader component
  const handleFileSelect = useCallback((selectedFile) => {
    setFile(selectedFile);
    setConvertDisabled(!selectedFile);
  }, []);

  // Connect to SSE for progress updates
  useEffect(() => {
    // Store the current ref value in a variable inside the effect
    const eventSource = eventSourceRef.current;

    // Clean up event source on unmount
    return () => {
      if (eventSource) {
        eventSource.close();
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
        <div className="mb-12">
          <header className="text-center">
            <div className="flex items-center justify-center mb-2">
              <h1 className="text-4xl font-bold text-black">
                Convert JSON to CSV
              </h1>
            </div>
            <p className="text-gray-500">
              Upload your JSON file and convert it to CSV format.
            </p>
          </header>
        </div>

        <div className="max-w-4xl mx-auto p-8 space-y-8 w-full">
          <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300 transition-all">
            <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
              <i className="fas fa-file-upload text-black mr-3"></i>Upload JSON
              File
            </h2>

            {/* Replace the custom error and success messages with AlertMessage component */}
            {errorMessage && (
              <AlertMessage
                type="error"
                message={errorMessage}
                autoHideDuration={8000}
                onClose={() => setErrorMessage(null)}
              />
            )}

            {successMessage && (
              <AlertMessage
                type="success"
                message={successMessage}
                autoHideDuration={5000}
                onClose={() => setSuccessMessage(null)}
              />
            )}

            <div className="space-y-6">
              {/* Replace the old file upload with our new component */}
              <FileUploader
                accept=".json,application/json"
                maxSize={5}
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
      </div>
      <Footer />
    </div>
  );
}

export default JsonConverter;
