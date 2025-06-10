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

  const [clientEmail] = useState(localStorage.getItem("email") || "");
  const [accountName] = useState(localStorage.getItem("accountName"));

  const eventSourceRef = useRef(null);

  const headerRightContent = (
    <div className="flex items-center space-x-4">
      <button
        onClick={() => navigate("/dashboard")}
        className="border border-black text-black px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all duration-200"
      >
        Back to Dashboard
      </button>

      <Dropdown
        trigger={
          <div className="flex items-center space-x-2 cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-black font-bold text-base shadow-sm">
              {clientEmail.charAt(0).toUpperCase()}
            </div>
            <i className="fas fa-chevron-down text-gray-500"></i>
          </div>
        }
      >
        <ul className="py-2 rounded-xl shadow-lg">
          <li className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 cursor-default">
            <i className="fas fa-user mr-2 text-gray-500"></i>
            <span className="font-medium">Account:</span> {accountName}
          </li>
          <li className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 cursor-default">
            <i className="fas fa-envelope mr-2 text-gray-500"></i>
            <span className="font-medium">Email:</span> {clientEmail}
          </li>
          <hr className="my-2 border-gray-200" />

          <li
            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 hover:text-black cursor-pointer"
            onClick={() => {
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

      // Clean up any existing event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Create form data for file upload
      const formData = new FormData();
      formData.append("jsonFile", file);

      // Set initial progress for better UX
      setStatus("Uploading file...");
      setProgress(20);

      // Show intermediate progress steps to improve user experience
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          // Don't go beyond 90% until we get actual completion
          if (prev < 90) {
            return prev + 5;
          }
          return prev;
        });

        if (progress >= 30 && progress < 50) {
          setStatus("Processing JSON data...");
        } else if (progress >= 50 && progress < 70) {
          setStatus("Converting to CSV format...");
        } else if (progress >= 70 && progress < 90) {
          setStatus("Storing in cloud...");
        }
      }, 2000);

      // Use the API service without SSE
      const response = await convertJsonToCsv(formData);

      // Clear the progress interval
      clearInterval(progressInterval);

      // Set to 100% when complete
      setProgress(100);
      setStatus("Conversion completed!");

      // Handle the response
      if (response.success) {
        // Use the download URL provided by the backend
        const apiUrl =
          process.env.REACT_APP_API_URL || "http://localhost:5000/api";

        // Construct the download URL correctly
        const downloadUrl = `${apiUrl}${response.downloadUrl}`;

        console.log("Download URL:", downloadUrl); // For debugging

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
    <div className="min-h-screen bg-gray-50 text-gray-700 flex flex-col">
      {/* Header */}
      <Header rightContent={headerRightContent} />
      <div className="flex-grow flex items-center justify-center py-10 px-6">
        <div className="max-w-4xl mx-auto w-full">
          <div className="mb-10">
            <header className="text-center">
              <h1 className="text-4xl font-bold text-black mb-3">
                Convert JSON to CSV
              </h1>
              <p className="text-lg text-gray-600">
                Upload your JSON file and convert it to CSV format with ease.
              </p>
            </header>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200 transition-all hover:shadow-lg">
            <h2 className="text-xl font-semibold text-black mb-6 flex items-center">
              <i className="fas fa-file-upload text-black mr-3 text-2xl"></i>
              Upload JSON File
            </h2>

            {/* Alert messages */}
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
              {/* File uploader */}
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
                className={`w-full bg-black text-white py-3.5 px-6 rounded-xl hover:bg-gray-800 transition-all duration-200 flex items-center justify-center font-medium text-base shadow-sm ${
                  convertDisabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={convertDisabled}
              >
                <i className="fas fa-sync-alt mr-2"></i>Convert to CSV
              </button>

              {showProgress && (
                <div className="space-y-5 mt-7 bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-medium text-gray-800 text-lg">
                    Conversion Progress
                  </h3>
                  <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-black text-xs text-white text-center leading-relaxed transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    >
                      {`${Math.round(progress)}%`}
                    </div>
                  </div>
                  <div className="text-base text-gray-600 italic">{status}</div>
                </div>
              )}

              {showResult && (
                <div className="space-y-5 mt-7 bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-medium text-gray-800 text-lg">
                    Conversion Complete
                  </h3>
                  <p className="text-gray-600 text-base">
                    Your file has been successfully converted!
                  </p>
                  <a
                    href={downloadUrl}
                    download={downloadFilename}
                    className="block w-full bg-black text-white text-center py-3 rounded-xl hover:bg-gray-800 transition-all duration-200 flex items-center justify-center font-medium text-base shadow-sm"
                  >
                    <i className="fas fa-download mr-2"></i>Download CSV
                  </a>
                  <button
                    onClick={handleClearFile}
                    className="block w-full border border-gray-300 text-gray-700 text-center py-3 rounded-xl hover:bg-gray-100 transition-all duration-200 flex items-center justify-center font-medium text-base mt-3"
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
