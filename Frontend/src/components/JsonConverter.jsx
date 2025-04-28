import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import Header from "./Header";
import Footer from "./Footer";

import { convertJsonToCsv } from "../services/api";

function JsonConverter() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [convertDisabled, setConvertDisabled] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

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

  // Handle selected files - wrap with useCallback to memoize the function
  const handleFiles = useCallback((e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        setFile(file);
        setSelectedFileName(file.name);
        setConvertDisabled(false);
      } else {
        setFile(null);
        setSelectedFileName("Please select a JSON file");
        setConvertDisabled(true);
        setErrorMessage("Please select a valid JSON file");
        setTimeout(() => {
          setErrorMessage(null);
        }, 8000);
      }
    }
  }, []); // No dependencies since it doesn't use any state that changes

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

  // Handle drag and drop functionality
  useEffect(() => {
    const dropZone = dropZoneRef.current;

    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const highlight = () => {
      dropZone.classList.add("border-gray-400");
    };

    const unhighlight = () => {
      dropZone.classList.remove("border-gray-400");
    };

    const handleDrop = (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      handleFiles({ target: { files } });
    };

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, highlight, false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener("drop", handleDrop, false);

    return () => {
      // Clean up event listeners
      ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dropZone.removeEventListener(eventName, preventDefaults, false);
        document.body.removeEventListener(eventName, preventDefaults, false);
      });

      ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.removeEventListener(eventName, highlight, false);
      });

      ["dragleave", "drop"].forEach((eventName) => {
        dropZone.removeEventListener(eventName, unhighlight, false);
      });

      dropZone.removeEventListener("drop", handleDrop, false);
    };
  }, [handleFiles]); // Add handleFiles to dependency array

  // Convert JSON to CSV
  const convertJsonToCsv = async (jsonData) => {
    try {
      // Parse the JSON data
      const parsedData = JSON.parse(jsonData);

      let dataArray = [];

      // Handle different JSON structures
      if (Array.isArray(parsedData)) {
        // Direct array of objects
        dataArray = parsedData;
      } else if (typeof parsedData === "object") {
        // Find first array in the object
        for (const key in parsedData) {
          if (Array.isArray(parsedData[key])) {
            dataArray = parsedData[key];
            break;
          }
        }

        // If no array found, treat the object as a single item
        if (dataArray.length === 0) {
          dataArray = [parsedData];
        }
      } else {
        throw new Error("Unsupported JSON structure");
      }

      if (dataArray.length === 0) {
        throw new Error("No valid data found in JSON");
      }

      // Extract headers from the first object
      const headers = Object.keys(dataArray[0]);

      // Create CSV header row
      let csv = headers.join(",") + "\n";

      // Function to process object value for CSV
      const processValue = (value) => {
        if (value === null || value === undefined) {
          return "";
        } else if (typeof value === "object") {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        } else if (typeof value === "string") {
          return `"${value.replace(/"/g, '""')}"`;
        } else {
          return value;
        }
      };

      // Process each data row
      for (let i = 0; i < dataArray.length; i++) {
        const row = dataArray[i];
        const values = headers.map((header) => processValue(row[header]));
        csv += values.join(",") + "\n";

        // Update progress periodically
        if (i % Math.max(1, Math.floor(dataArray.length / 100)) === 0) {
          const progressPercent = Math.min(
            99,
            Math.round((i / dataArray.length) * 100)
          );
          setProgress(progressPercent);
          setStatus(`Processing row ${i + 1} of ${dataArray.length}...`);
          // Allow UI to update
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      return csv;
    } catch (error) {
      console.error("Error converting JSON to CSV:", error);
      throw error;
    }
  };

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

      // Send to server
      setStatus("Uploading file...");
      setProgress(20);

      const response = await convertJsonToCsv(formData);

      setProgress(80);
      setStatus("Processing complete!");

      // Handle the response
      if (response.success) {
        // Create download URL for the converted file
        const downloadUrl = `${process.env.REACT_APP_API_URL.replace(
          "/api",
          ""
        )}/downloads/${response.filename}`;
        setDownloadUrl(downloadUrl);
        setDownloadFilename(response.filename);

        setProgress(100);
        setStatus("Conversion completed!");

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
    setSelectedFileName("");
    setConvertDisabled(true);
    setShowProgress(false);
    setShowResult(false);
    setDownloadUrl("");
    setDownloadFilename("");
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
            <div
              ref={dropZoneRef}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
            >
              <input
                type="file"
                id="jsonFile"
                ref={fileInputRef}
                accept=".json"
                className="hidden"
                onChange={handleFiles}
              />
              <label htmlFor="jsonFile" className="cursor-pointer">
                <i className="fas fa-cloud-upload-alt text-5xl text-gray-400 mb-4 block"></i>
                <span className="text-gray-600 font-medium">
                  Drag and drop your JSON file here, or
                </span>
                <span className="block mt-2 text-gray-800 font-semibold">
                  Browse Files
                </span>
                {selectedFileName && (
                  <div className="mt-3">
                    <span className="text-sm text-gray-500">
                      Selected file: {selectedFileName}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleClearFile();
                      }}
                      className="ml-2 text-sm text-red-500 hover:text-red-700"
                      title="Remove file"
                    >
                      <i className="fas fa-times-circle"></i>
                    </button>
                  </div>
                )}
                <div className="mt-6 text-gray-500 text-sm">
                  <p>Maximum file size: 2GB</p>
                  <p>Supported format: JSON only</p>
                </div>
              </label>
            </div>

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
