import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { uploadCSV, validateCSVData, generateFiles } from "../services/api";
import Header from "./Header";
import Footer from "./Footer";
import ColumnMapping from "./ColumnMapping";

function SftpGenerator() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [headers, setHeaders] = useState([]);
  const [identityColumn, setIdentityColumn] = useState("");
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const [data, setData] = useState([]);
  const [filePath, setFilePath] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState([]);

  const [validationResults, setValidationResults] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [emailColumn, setEmailColumn] = useState("");
  const [phoneColumn, setPhoneColumn] = useState("");
  const [totalRows, setTotalRows] = useState(0);

  const [columnMappings, setColumnMappings] = useState([]);
  const [dataType, setDataType] = useState("profile");
  const [clientEmail, setClientEmail] = useState(
    localStorage.getItem("email") || ""
  );
  const [accountName] = useState(localStorage.getItem("accountName"));

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [processingStep, setProcessingStep] = useState("");

  const [downloadLinks, setDownloadLinks] = useState({
    manifest: "",
    csv: "",
    zip: "",
  });

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

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith(".csv")) {
      setFile(selectedFile);
      setSelectedFileName(selectedFile.name);

      // Display file size information
      const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
      console.log(`Selected file size: ${fileSizeMB} MB`);

      if (selectedFile.size > 5 * 1024 * 1024 * 1024) {
        displayError("File size exceeds the 5GB limit.");
        setFile(null);
        setSelectedFileName("");
      }
    } else {
      setFile(null);
      setSelectedFileName("");
      displayError("Please select a CSV file.");
    }
  };

  // Function to display error messages with auto-hide
  const displayError = (message) => {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage("");
    }, 8000);
  };

  // Handle form submission for file upload
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    try {
      setLoading(true);
      setIsUploading(true);
      setProcessingStep("Uploading file");
      setUploadProgress(0);

      // Create a FormData object with the file
      const formData = new FormData();
      formData.append("file", file);

      // Use axios to upload with progress tracking
      const response = await uploadCSV(formData, (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        setUploadProgress(percentCompleted);
      });

      setIsUploading(false);
      setProcessingStep("Processing data");

      if (response.success) {
        // Handle successful response
        setData(response.data || []);
        setHeaders(response.columns || []);
        setFilePath(response.filePath || "");
        setTotalRows(response.totalRows || 0);

        // Auto-detect columns if headers are available
        if (response.columns && response.columns.length > 0) {
          autoDetectColumns(response.columns);
        }

        setCurrentStep(2);
        setErrorMessage("");
      } else {
        throw new Error(response.message || "Error uploading CSV");
      }
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error.message || "Error processing the file");
      setIsUploading(false);
    } finally {
      setLoading(false);
      setProcessingStep("");
    }
  };

  // Function to auto-detect columns for identity, email, and phone
  const autoDetectColumns = (columns) => {
    if (!columns || columns.length === 0) return;

    columns.forEach((column) => {
      const lowerColumn = column.toLowerCase();

      // Identity column guessing
      if (
        lowerColumn.includes("identity") ||
        lowerColumn.includes("id") ||
        lowerColumn.includes("user") ||
        lowerColumn === "guid" ||
        lowerColumn === "uuid"
      ) {
        setIdentityColumn(column);
      }

      // Email column guessing
      if (
        lowerColumn === "email" ||
        lowerColumn.includes("email_address") ||
        lowerColumn.includes("emailaddress")
      ) {
        setEmailColumn(column);
      }

      // Phone column guessing
      if (
        lowerColumn === "phone" ||
        lowerColumn.includes("phone_number") ||
        lowerColumn.includes("phonenumber") ||
        lowerColumn.includes("mobile") ||
        lowerColumn.includes("cell")
      ) {
        setPhoneColumn(column);
      }
    });
  };

  // Handle drag and drop functionality
  useEffect(() => {
    const dropZone = dropZoneRef.current;

    const handleDragOver = (e) => {
      e.preventDefault();
      dropZone.classList.add("border-gray-400");
    };

    const handleDragLeave = () => {
      dropZone.classList.remove("border-gray-400");
    };

    const handleDrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove("border-gray-400");

      if (e.dataTransfer.files.length) {
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile.name.endsWith(".csv")) {
          setFile(droppedFile);
          setSelectedFileName(droppedFile.name);
          if (fileInputRef.current) {
            // Update the file input for form submission
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(droppedFile);
            fileInputRef.current.files = dataTransfer.files;
          }
        } else {
          displayError("Please select a CSV file.");
        }
      }
    };

    if (dropZone) {
      dropZone.addEventListener("dragover", handleDragOver);
      dropZone.addEventListener("dragleave", handleDragLeave);
      dropZone.addEventListener("drop", handleDrop);
    }

    return () => {
      if (dropZone) {
        dropZone.removeEventListener("dragover", handleDragOver);
        dropZone.removeEventListener("dragleave", handleDragLeave);
        dropZone.removeEventListener("drop", handleDrop);
      }
    };
  }, []);

  // Continue to validation after identity mapping
  const handleContinueToValidation = async () => {
    if (!identityColumn) {
      setErrorMessage("Identity column is required");
      return;
    }

    try {
      setLoading(true);
      setIsUploading(true);
      setProcessingStep("Validating data");
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("identityColumn", identityColumn);
      formData.append("emailColumn", emailColumn || "");
      formData.append("phoneColumn", phoneColumn || "");

      // Use the enhanced validateCSVData function with progress tracking
      const response = await validateCSVData(formData, (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        setUploadProgress(percentCompleted);
      });

      setIsUploading(false);

      if (response.success) {
        setValidationResults(response.results);

        // Create initial column mappings from headers
        if (headers && headers.length > 0) {
          const initialMappings = headers.map((column) => ({
            csv_name: column,
            clevertap_name: column,
            type: "string",
          }));
          setColumnMappings(initialMappings);
        }

        setCurrentStep(3);
        setErrorMessage("");
      } else {
        throw new Error(response.message || "Validation failed");
      }
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error.message || "Error validating data");
      setIsUploading(false);
    } finally {
      setLoading(false);
      setProcessingStep("");
    }
  };

  const renderLoadingState = () => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
            <div className="text-center">
              <p className="text-gray-700 font-medium">{processingStep}</p>
              {isUploading && (
                <div className="mt-4 w-full">
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {uploadProgress}% complete
                  </p>
                </div>
              )}
              <p className="text-gray-500 text-sm mt-2">
                Large files may take several minutes. Please don't close this
                window.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Generate SFTP files
  const handleGenerateFiles = async () => {
    try {
      setLoading(true);
      console.log("Generating files...");

      // Format columns as expected by the backend
      const formattedColumns = columnMappings.map((mapping) => {
        // Ensure each mapping is properly formatted
        if (!mapping || typeof mapping !== "object") {
          console.error("Invalid mapping:", mapping);
          throw new Error("Invalid column mapping detected");
        }

        return {
          csv_name: mapping.originalName || mapping.csv_name || mapping.name,
          clevertap_name: mapping.clevertap_name || mapping.name,
          type: mapping.type,
        };
      });

      console.log("Formatted columns:", formattedColumns);

      const payload = {
        accountName: localStorage.getItem("accountName") || "default",
        columns: formattedColumns,
        type: dataType,
        fileName: selectedFileName,
        clientEmail: clientEmail.trim(),
        filePath,
        identityColumn: identityColumn,
      };

      console.log("Sending payload:", payload);
      const response = await generateFiles(payload);

      if (
        response &&
        response.manifest_url &&
        response.csv_url &&
        response.zip_url
      ) {
        // Store in a format your component can use
        const links = {
          manifest: response.manifest_url,
          csv: response.csv_url,
          zip: response.zip_url,
        };

        setDownloadLinks(links); // Update the download links state
        setGeneratedFiles([
          { type: "manifest", url: response.manifest_url },
          { type: "csv", url: response.csv_url },
          { type: "zip", url: response.zip_url },
        ]);
        setCurrentStep(4);
        setErrorMessage("");
      } else {
        throw new Error(response.error || "File generation failed");
      }
    } catch (error) {
      console.error("Error in handleGenerateFiles:", error);
      setErrorMessage(
        typeof error === "string"
          ? error
          : error.message || "Error generating files"
      );
    } finally {
      setLoading(false);
    }
  };

  // Function to download files
  const downloadFile = (url, fileName) => {
    try {
      // API_URL base for relative URLs
      const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";

      // Format the URL properly based on what the server expects
      let downloadUrl;

      if (url.startsWith("http")) {
        // Full URL, use as is
        downloadUrl = url;
      } else if (url.startsWith("/")) {
        // Path starting with slash, append to base URL
        downloadUrl = `${baseUrl}${url}`;
      } else {
        // Otherwise assume it's a filename for the download endpoint
        downloadUrl = `${baseUrl}/api/download/${url}`;
      }

      console.log("Downloading file from:", downloadUrl);

      // Create a link element and trigger the download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
      setErrorMessage(`Failed to download ${fileName}`);
    }
  };

  // Reset the form to start over
  const handleReset = () => {
    setFile(null);
    setSelectedFileName("");
    setHeaders([]);
    setIdentityColumn("");
    setEmailColumn("");
    setPhoneColumn("");
    setValidationResults(null);
    setErrorMessage("");
    setCurrentStep(1);
  };

  // Render files step
  const renderFilesStep = () => {
    // Create links from the generatedFiles array if it exists
    const links = generatedFiles?.length
      ? {
          zip: generatedFiles.find((f) => f.type === "zip")?.url || "",
          manifest:
            generatedFiles.find((f) => f.type === "manifest")?.url || "",
          csv: generatedFiles.find((f) => f.type === "csv")?.url || "",
        }
      : downloadLinks;

    return (
      <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300">
        <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
          <i className="fas fa-file-export text-black mr-3"></i>Files Generated
        </h2>

        <div className="mb-8 p-4 bg-green-50 text-green-800 rounded-lg border border-green-200">
          <div className="flex">
            <i className="fas fa-check-circle mr-2 text-xl"></i>
            <span className="font-medium">
              Success! Your migration files have been generated.
            </span>
          </div>
        </div>

        <div className="p-6 rounded-lg border border-gray-300 mb-6">
          <h3 className="text-lg font-medium text-gray-700 mb-4">
            Download Options
          </h3>
          <div className="space-y-4">
            {links.zip && (
              <div className="p-4 border border-gray-200 rounded-md bg-white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <i className="fas fa-file-archive text-gray-500 text-xl mr-3"></i>
                    <div>
                      <p className="font-medium">All Files</p>
                      <p className="text-sm text-gray-500">
                        Contains manifest and CSV files
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      downloadFile(links.zip, `${accountName}_${dataType}.zip`)
                    }
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors text-sm flex items-center"
                  >
                    <i className="fas fa-download mr-2"></i>Download ZIP
                  </button>
                </div>
              </div>
            )}

            {links.manifest && (
              <div className="p-4 border border-gray-200 rounded-md bg-white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <i className="fas fa-file-code text-gray-500 text-xl mr-3"></i>
                    <div>
                      <p className="font-medium">Manifest File</p>
                      <p className="text-sm text-gray-500">
                        JSON configuration for SFTP upload
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      downloadFile(
                        links.manifest,
                        `${accountName}_manifest.json`
                      )
                    }
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors text-sm flex items-center"
                  >
                    <i className="fas fa-download mr-2"></i>Download JSON
                  </button>
                </div>
              </div>
            )}

            {links.csv && (
              <div className="p-4 border border-gray-200 rounded-md bg-white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <i className="fas fa-file-csv text-gray-500 text-xl mr-3"></i>
                    <div>
                      <p className="font-medium">CSV Data File</p>
                      <p className="text-sm text-gray-500">
                        Processed data ready for import
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      downloadFile(links.csv, `${accountName}_data.csv`)
                    }
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors text-sm flex items-center"
                  >
                    <i className="fas fa-download mr-2"></i>Download CSV
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={handleReset}
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
          >
            <i className="fas fa-redo mr-2"></i>Start Over
          </button>
        </div>
      </div>
    );
  };

  // Render validation step
  const renderValidationStep = () => {
    return (
      <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300">
        <h2 className="text-2xl font-semibold text-black mb-2 flex items-center">
          <i className="fas fa-check-circle text-black mr-3"></i>Validation
          Results
        </h2>

        {/* Show validation results first */}
        {validationResults && !validationResults.validationErrors && (
          <div className="mb-6 p-4 bg-green-50 text-green-800 rounded-lg border border-green-200">
            <div className="flex">
              <i className="fas fa-check-circle mr-2 text-xl"></i>
              <span className="font-medium">
                CSV file validated successfully! You can now customize column
                mappings below.
              </span>
            </div>
            <div className="mt-4">
              <span className="font-medium">Summary:</span>
              <ul className="list-disc pl-5 mt-2">
                <li>Total records: {totalRows}</li>
                <li>Valid records: {totalRows}</li>
                <li>Identity field: {identityColumn}</li>
                {emailColumn && <li>Email field: {emailColumn}</li>}
                {phoneColumn && <li>Phone field: {phoneColumn}</li>}
              </ul>
            </div>
          </div>
        )}

        {validationResults && validationResults.validationErrors && (
          <div className="mb-6 p-4 bg-orange-50 text-orange-800 rounded-lg border border-orange-200">
            <div className="flex">
              <i className="fas fa-exclamation-triangle mr-2 text-xl"></i>
              <span className="font-medium">
                Validation issues found. Please review and fix before
                proceeding.
              </span>
            </div>
            <div className="mt-4">
              <span className="font-medium">Issues:</span>
              <ul className="list-disc pl-5 mt-2">
                {validationResults.validationErrors.blankIdentityCount > 0 && (
                  <li>
                    {validationResults.validationErrors.blankIdentityCount} rows
                    have blank identity values
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Download buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {validationResults &&
            validationResults.validationErrors &&
            validationResults.validationErrors.logFileUrl && (
              <div>
                <button
                  onClick={() =>
                    downloadFile(
                      validationResults.validationErrors.logFileUrl,
                      "validation_log.csv"
                    )
                  }
                  className="w-full bg-gray-400 text-white px-4 py-3 rounded-lg hover:bg-gray-500 transition-colors flex items-center justify-center font-medium"
                >
                  <i className="fas fa-download mr-2"></i>Download Validation
                  Log
                </button>
              </div>
            )}

          {validationResults && validationResults.validEntriesUrl && (
            <div>
              <button
                onClick={() =>
                  downloadFile(
                    validationResults.validEntriesUrl,
                    "valid_entries.csv"
                  )
                }
                className="w-full bg-black text-white px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center font-medium"
              >
                <i className="fas fa-file-download mr-2"></i>Download Valid CSV
              </button>
            </div>
          )}
        </div>

        {/* Client Information with less spacing */}
        <div className="mb-6 border-t border-gray-200 pt-4">
          <h3 className="text-lg font-semibold text-black mb-4">
            Client Information
          </h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="text-red-500">*</span> Email Address:
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <i className="fas fa-envelope text-gray-400"></i>
              </div>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                required
                placeholder="Enter your email address"
                className="w-full pl-10 p-3 border border-gray-400 rounded-lg appearance-none focus:ring-2 focus:ring-black focus:border-black outline-none bg-white transition-all"
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              You will get logs on this email address.
            </p>
          </div>
        </div>

        {/* Column Mapping section with less spacing */}
        {!validationResults?.validationErrors && (
          <>
            <div className="mb-6 border-t border-gray-200 pt-4">
              <h3 className="text-lg font-semibold text-black mb-4">
                Data Configuration
              </h3>
              <p className="text-gray-500 mb-4">
                Specify how each column should be mapped to CleverTap. You can
                customize field names and data types.
              </p>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Type:
                </label>
                <div className="flex space-x-4 mb-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio h-4 w-4"
                      name="dataType"
                      value="profile"
                      checked={dataType === "profile"}
                      onChange={() => setDataType("profile")}
                    />
                    <span className="ml-2 text-gray-700">Profile Data</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio h-4 w-4"
                      name="dataType"
                      value="event"
                      checked={dataType === "event"}
                      onChange={() => setDataType("event")}
                    />
                    <span className="ml-2 text-gray-700">Event Data</span>
                  </label>
                </div>
              </div>

              <ColumnMapping
                columns={headers}
                initialMappings={columnMappings}
                onMappingsChange={setColumnMappings}
                targetSystem="CleverTap"
              />
            </div>
          </>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setCurrentStep(2)}
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
          >
            <i className="fas fa-arrow-left mr-2"></i>Back
          </button>
          <button
            onClick={handleGenerateFiles}
            className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center font-medium"
            disabled={
              (validationResults && validationResults.validationErrors) ||
              !clientEmail.trim()
            }
          >
            Generate Files<i className="fas fa-arrow-right ml-2"></i>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen text-gray-700 flex flex-col">
      <Header rightContent={headerRightContent} />

      <div className="max-w-4xl mx-auto p-8 space-y-8 w-full">
        <div className="mb-12">
          <header className="text-center">
            <div className="flex items-center justify-center mb-2">
              <h1 className="text-4xl font-bold text-black">
                Generate SFTP Files
              </h1>
            </div>
            <p className="text-gray-500">
              Import your data into CleverTap via SFTP
            </p>
          </header>
        </div>

        {/* Error Message Display */}
        {errorMessage && (
          <div
            className="bg-gray-100 border-l-4 border-gray-800 text-gray-800 p-4 rounded-lg mb-6"
            role="alert"
          >
            <div className="flex items-center">
              <i className="fas fa-exclamation-circle text-gray-800 mr-3 text-lg"></i>
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Progress Tracker */}
        <div className="flex justify-between items-center mb-8 px-8">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2 ${
                currentStep >= 1
                  ? "bg-black text-white"
                  : "bg-gray-300 text-gray-500"
              }`}
            >
              1
            </div>
            <span
              className={`text-sm font-medium ${
                currentStep >= 1 ? "text-black" : "text-gray-500"
              }`}
            >
              Upload
            </span>
          </div>
          <div
            className={`h-1 flex-grow mx-2 ${
              currentStep >= 2 ? "bg-black" : "bg-gray-300"
            }`}
          ></div>
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2 ${
                currentStep >= 2
                  ? "bg-black text-white"
                  : "bg-gray-300 text-gray-500"
              }`}
            >
              2
            </div>
            <span
              className={`text-sm font-medium ${
                currentStep >= 2 ? "text-black" : "text-gray-500"
              }`}
            >
              Map
            </span>
          </div>
          <div
            className={`h-1 flex-grow mx-2 ${
              currentStep >= 3 ? "bg-black" : "bg-gray-300"
            }`}
          ></div>
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2 ${
                currentStep >= 3
                  ? "bg-black text-white"
                  : "bg-gray-300 text-gray-500"
              }`}
            >
              3
            </div>
            <span
              className={`text-sm font-medium ${
                currentStep >= 3 ? "text-black" : "text-gray-500"
              }`}
            >
              Validate
            </span>
          </div>
          <div
            className={`h-1 flex-grow mx-2 ${
              currentStep >= 4 ? "bg-black" : "bg-gray-300"
            }`}
          ></div>
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2 ${
                currentStep >= 4
                  ? "bg-black text-white"
                  : "bg-gray-300 text-gray-500"
              }`}
            >
              4
            </div>
            <span
              className={`text-sm font-medium ${
                currentStep >= 4 ? "text-black" : "text-gray-500"
              }`}
            >
              Generate
            </span>
          </div>
        </div>

        {/* Step 1: Upload File */}
        {currentStep === 1 && (
          <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300">
            <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
              <i className="fas fa-file-upload text-black mr-3"></i>Upload CSV
              File
            </h2>

            <form onSubmit={handleSubmit}>
              <div
                ref={dropZoneRef}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
              >
                <input
                  type="file"
                  id="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".csv"
                  required
                />
                <label htmlFor="file" className="cursor-pointer">
                  <i className="fas fa-cloud-upload-alt text-5xl text-gray-400 mb-4 block"></i>
                  <span className="text-gray-600 font-medium">
                    Drag and drop your CSV file here, or
                  </span>
                  <span className="block mt-2 text-black font-semibold">
                    Browse Files
                  </span>
                  {selectedFileName && (
                    <span className="block mt-3 text-sm text-gray-500">
                      {selectedFileName}
                    </span>
                  )}
                </label>
                <div className="mt-6 text-gray-500 text-sm">
                  <p>Maximum file size: 5GB</p>
                  <p>Supported format: CSV only</p>
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-6 bg-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center font-medium"
              >
                <i className="fas fa-upload mr-2"></i>Process CSV
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Identity Mapping */}
        {currentStep === 2 && (
          <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300">
            <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
              <i className="fas fa-fingerprint text-black mr-3"></i>Map Identity
              Fields
            </h2>

            <div className="w-full h-px bg-gray-200 mb-6"></div>

            <p className="text-gray-500 mb-6">
              Please select which columns in your CSV file contain identity
              information. Identity column is required for validation.
            </p>

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="identityColumn"
                  className="block text-sm font-medium text-gray-600 mb-2"
                >
                  <span className="text-red-500">*</span> Identity Column:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <i className="fas fa-id-card text-gray-400"></i>
                  </div>
                  <select
                    id="identityColumn"
                    value={identityColumn}
                    onChange={(e) => setIdentityColumn(e.target.value)}
                    required
                    className="w-full pl-10 p-3 border border-gray-400 rounded-lg appearance-none focus:ring-2 focus:ring-black focus:border-black outline-none bg-white transition-all pr-10"
                  >
                    <option value="" disabled>
                      Select Identity Column
                    </option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <i className="fas fa-chevron-down text-gray-400"></i>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  This column uniquely identifies each user (required)
                </p>
              </div>

              <div>
                <label
                  htmlFor="emailColumn"
                  className="block text-sm font-medium text-gray-600 mb-2"
                >
                  Email Column:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <i className="fas fa-envelope text-gray-400"></i>
                  </div>
                  <select
                    id="emailColumn"
                    value={emailColumn}
                    onChange={(e) => setEmailColumn(e.target.value)}
                    className="w-full pl-10 p-3 border border-gray-400 rounded-lg appearance-none focus:ring-2 focus:ring-black focus:border-black outline-none bg-white transition-all pr-10"
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>

                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <i className="fas fa-chevron-down text-gray-400"></i>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Optional: Select the column containing email addresses for
                  validation
                </p>
              </div>

              <div>
                <label
                  htmlFor="phoneColumn"
                  className="block text-sm font-medium text-gray-600 mb-2"
                >
                  Phone Column:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <i className="fas fa-phone text-gray-400"></i>
                  </div>
                  <select
                    id="phoneColumn"
                    value={phoneColumn}
                    onChange={(e) => setPhoneColumn(e.target.value)}
                    className="w-full pl-10 p-3 border border-gray-400 rounded-lg appearance-none focus:ring-2 focus:ring-black focus:border-black outline-none bg-white transition-all pr-10"
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <i className="fas fa-chevron-down text-gray-400"></i>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Optional: Select the column containing phone numbers for
                  validation
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <button
                onClick={() => setCurrentStep(1)}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
              >
                <i className="fas fa-arrow-left mr-2"></i>Back
              </button>
              <button
                onClick={handleContinueToValidation}
                className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center font-medium"
              >
                Validate Data<i className="fas fa-arrow-right ml-2"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Validation Results */}
        {currentStep === 3 && renderValidationStep()}

        {/* Step 4: Files Generated */}
        {currentStep === 4 && renderFilesStep()}

        {/* Loading state */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg flex items-center space-x-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
              <div>
                <p className="text-gray-700 font-medium">
                  Processing your CSV file...
                </p>
                <p className="text-gray-500 text-sm">
                  This may take a moment depending on file size
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default SftpGenerator;
