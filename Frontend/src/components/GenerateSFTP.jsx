import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  uploadCSV,
  generateFiles,
  listS3Buckets,
  listS3Files,
  fetchFromS3,
  validateCSVMapping,
  downloadFile,
} from "../services/api";

import Header from "./common/Header";
import Footer from "./common/Footer";
import ColumnMapping from "./common/ColumnMapping";
import FileUploader from "./common/FileUploader";
import Loading from "./common/Loading";
import Dropdown from "./common/Dropdown";
import AlertMessage from "./common/AlertMessage";

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

  const [, setData] = useState([]);
  const [filePath, setFilePath] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState([]);

  const [validationResults, setValidationResults] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [emailColumn, setEmailColumn] = useState("");
  const [phoneColumn, setPhoneColumn] = useState("");
  const [totalRows, setTotalRows] = useState(0);

  const [successMessage, setSuccessMessage] = useState("");

  const [columnMappings, setColumnMappings] = useState([]);
  const [dataType, setDataType] = useState("profile");
  const [clientEmail, setClientEmail] = useState(
    localStorage.getItem("email") || ""
  );
  const [accountName] = useState(localStorage.getItem("accountName"));

  const [, setUploadProgress] = useState(0);
  const [, setIsUploading] = useState(false);
  const [, setProcessingStep] = useState("");

  // Add new state for S3
  const [activeTab, setActiveTab] = useState("local");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [s3Config, setS3Config] = useState({
    region: "",
    accessKey: "",
    secretKey: "",
    bucket: "",
    filePath: "",
  });
  const [buckets, setBuckets] = useState([]);
  const [files, setFiles] = useState([]);
  const [isS3Connected, setIsS3Connected] = useState(false);

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

  // Function to display error messages with auto-hide
  const displayError = (message) => {
    setErrorMessage(message);
    setTimeout(() => {
      setErrorMessage("");
    }, 8000);
  };

  // Handle form submission for file upload
  const handleSubmit = async () => {
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

  // Add S3 related functions
  const handleS3Connect = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      if (!s3Config.region || !s3Config.accessKey || !s3Config.secretKey) {
        throw new Error("Please provide all AWS credentials");
      }

      const response = await listS3Buckets({
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secretKey: s3Config.secretKey,
      });

      if (response.success && response.buckets) {
        setBuckets(
          response.buckets.map((bucket) => ({
            Name: bucket.name,
            CreationDate: bucket.creationDate,
          }))
        );
        setIsS3Connected(true);
      } else {
        throw new Error("Failed to fetch S3 buckets");
      }
    } catch (error) {
      console.error("S3 Connection error:", error);
      displayError(error.message || "Failed to connect to AWS");
      setIsS3Connected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBucketSelect = async (bucketName) => {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await listS3Files({
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secretKey: s3Config.secretKey,
        bucket: bucketName,
      });

      if (response.success) {
        setFiles(
          response.files.map((file) => ({
            Key: file.key,
            Size: file.size,
            LastModified: file.lastModified,
          }))
        );
        setS3Config((prev) => ({ ...prev, bucket: bucketName }));
      } else {
        throw new Error("Failed to list files");
      }
    } catch (error) {
      displayError(error.message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleS3FileSelect = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      setIsUploading(true);
      setProcessingStep("Fetching file from S3");
      setUploadProgress(0);

      // Step 1: Get file from S3
      const response = await fetchFromS3({
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secretKey: s3Config.secretKey,
        bucket: s3Config.bucket,
        filePath: s3Config.filePath,
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to fetch file from S3");
      }

      // Create File object from response
      const blob = new Blob([response.csvContent], { type: "text/csv" });
      const file = new File([blob], s3Config.filePath.split("/").pop(), {
        type: "text/csv",
      });

      // Update state with file information
      setFile(file);
      setHeaders(response.headers || []);
      setFilePath(response.filepath || "");
      setTotalRows(response.rowCount || 0);
      setSelectedFileName(s3Config.filePath.split("/").pop());

      // Auto-detect columns if headers are available
      if (response.headers && response.headers.length > 0) {
        autoDetectColumns(response.headers);
      }

      // Move to mapping step
      setCurrentStep(2);
      setErrorMessage("");
    } catch (error) {
      console.error("S3 file processing error:", error);
      displayError(error.message || "Failed to process S3 file");
    } finally {
      setLoading(false);
      setIsUploading(false);
      setProcessingStep("");
      setUploadProgress(0);
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

  // Continue to validation after identity mapping\
  const handleContinueToValidation = async () => {
    if (!identityColumn) {
      displayError("Identity column is required");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");
      console.log("Starting validation with identity column:", identityColumn);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("identityColumn", identityColumn);
      formData.append("emailColumn", emailColumn || "");
      formData.append("phoneColumn", phoneColumn || "");

      console.log("Sending validation request with:", {
        identity: identityColumn,
        email: emailColumn,
        phone: phoneColumn,
        fileName: selectedFileName,
      });

      // Use the new API function for validation
      const responseData = await validateCSVMapping(
        formData,
        (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      );

      console.log("Validation response data:", responseData);

      // Set validation results
      setValidationResults(responseData);

      // Add debug logging
      console.log("Full validation results:", responseData);

      // Create initial column mappings
      if (headers && headers.length > 0) {
        const initialMappings = headers.map((column) => ({
          csv_name: column,
          clevertap_name: column,
          type: "string",
          originalName: column,
        }));
        setColumnMappings(initialMappings);
      }
    } catch (error) {
      console.error("Validation error:", error);
      // Create a basic validation result object with the error
      const errorResults = {
        success: false,
        validationErrors: {
          message: error.message || "Error validating data",
          otherIssues: [error.message || "Unknown validation error occurred"],
        },
      };

      // Still set validation results so we can show the error in the UI
      setValidationResults(errorResults);
      displayError(error.message || "Error validating data");
    } finally {
      setLoading(false);
    }
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
          isCustom: mapping.isCustom || false,
          value: mapping.value || "", // Include default value for custom columns
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

  // Function to handle file download
  const handleFileDownload = (url, type) => {
    if (!url) {
      setErrorMessage(`Failed to download ${type} file: URL not provided`);
      return;
    }

    // Configure options for the download
    const options = {
      accountName,
      dataType,
      baseUrl: process.env.REACT_APP_API_URL || "http://localhost:5000",
    };

    downloadFile(url, type, options)
      .then(() => {
        // Optional: Show success message
        setSuccessMessage(
          `${type.charAt(0).toUpperCase() + type.slice(1)} download started`
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      })
      .catch((error) => {
        console.error(`Download error for ${type}:`, error);
        setErrorMessage(`Failed to download ${type} file`);
      });
  };

  // Reset the form to start over with all state resets
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
    setColumnMappings([]);
    setDataType("profile");
    setGeneratedFiles([]);
    setDownloadLinks({
      manifest: "",
      csv: "",
      zip: "",
    });
    setFilePath("");
    setTotalRows(0);
    setUploadProgress(0);
    setIsUploading(false);
    setProcessingStep("");
  };

  // Update the renderFilesStep function with the new download handlers
  const renderFilesStep = () => {
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
                    onClick={() => handleFileDownload(links.zip, "zip")}
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors text-sm flex items-center"
                  >
                    <i className="fas fa-download mr-2"></i>Download ZIP
                  </button>
                </div>
              </div>
            )}

            {/* {links.manifest && (
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
                    onClick={() => handleFileDownload(links.manifest, "manifest")}
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
                    onClick={() => handleFileDownload(links.csv, "csv")}
                    className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors text-sm flex items-center"
                  >
                    <i className="fas fa-download mr-2"></i>Download CSV
                  </button>
                </div>
              </div>
            )} */}
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => {
              handleReset();
              setCurrentStep(1);
            }}
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
          >
            <i className="fas fa-redo mr-2"></i>Start Over
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center font-medium"
          >
            <i className="fas fa-home mr-2"></i>Go to Dashboard
          </button>
        </div>
      </div>
    );
  };

  // Function to handle adding custom columns
  const handleAddCustomColumn = (result) => {
    if (!result.success) {
      displayError(result.message);
      return;
    }

    setSuccessMessage(result.message);

    // Clear success message after a delay
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  // Render validation step
  const renderValidationStep = () => {
    return (
      <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300">
        <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
          <i className="fas fa-map-marked-alt text-black mr-3"></i>Column
          Mapping
        </h2>

        <div className="w-full h-px bg-gray-200 mb-6"></div>

        {/* Client Information section */}
        <div className="mb-6">
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

        {/* Column Mapping section */}
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
            allowCustomColumns={true}
            onAddCustomColumn={handleAddCustomColumn}
          />
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setCurrentStep(2)}
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
          >
            <i className="fas fa-arrow-left mr-2"></i>Back
          </button>

          {/* Always enable the Generate Files button as long as email is provided */}
          <button
            onClick={handleGenerateFiles}
            className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!clientEmail.trim()}
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

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loading
            message="Processing your request..."
            subMessage="This may take a moment depending on file size"
          />
        </div>
      ) : (
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

          {/* Alert Message Display */}
          {errorMessage && (
            <AlertMessage
              type="error"
              message={errorMessage}
              autoHideDuration={8000}
              onClose={() => setErrorMessage("")}
            />
          )}

          {/* Success Message Display */}
          {successMessage && (
            <AlertMessage
              type="success"
              message={successMessage}
              autoHideDuration={5000}
              onClose={() => setSuccessMessage("")}
            />
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
                Validate
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
                Map
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
              {/* Tab Switcher */}
              <div className="mb-6 border-b border-gray-200">
                <div className="flex space-x-4">
                  <button
                    onClick={() => setActiveTab("local")}
                    className={`pb-2 px-4 ${
                      activeTab === "local"
                        ? "border-b-2 border-black text-black"
                        : "text-gray-500"
                    }`}
                  >
                    <i className="fas fa-laptop mr-2"></i>Local File
                  </button>
                  <button
                    onClick={() => setActiveTab("s3")}
                    className={`pb-2 px-4 ${
                      activeTab === "s3"
                        ? "border-b-2 border-black text-black"
                        : "text-gray-500"
                    }`}
                  >
                    <i className="fab fa-aws mr-2"></i>AWS S3
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {" "}
                {/* Changed from form to div */}
                {activeTab === "local" ? (
                  // Local file upload
                  <>
                    <FileUploader
                      accept=".csv,text/csv"
                      maxSize={5}
                      onFileSelect={(selectedFile) => {
                        setFile(selectedFile);
                        setSelectedFileName(
                          selectedFile ? selectedFile.name : ""
                        );
                      }}
                      onError={(message) => displayError(message)}
                      supportedFormats="CSV only"
                      showPreview={true}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="w-full mt-6 bg-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center font-medium"
                      disabled={!file || loading}
                    >
                      <i className="fas fa-upload mr-2"></i>Process CSV
                    </button>
                  </>
                ) : (
                  // S3 file selection
                  <div className="space-y-4">
                    {!isS3Connected ? (
                      // S3 Connection Form
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              AWS Region
                            </label>
                            <select
                              value={s3Config.region}
                              onChange={(e) =>
                                setS3Config((prev) => ({
                                  ...prev,
                                  region: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base bg-white"
                            >
                              <option value="">Select Region</option>
                              <option value="us-east-1">
                                US East (N. Virginia)
                              </option>
                              <option value="us-east-2">US East (Ohio)</option>
                              <option value="us-west-1">
                                US West (N. California)
                              </option>
                              <option value="us-west-2">
                                US West (Oregon)
                              </option>
                              <option value="af-south-1">
                                Africa (Cape Town)
                              </option>
                              <option value="ap-east-1">
                                Asia Pacific (Hong Kong)
                              </option>
                              <option value="ap-south-1">
                                Asia Pacific (Mumbai)
                              </option>
                              <option value="ap-northeast-1">
                                Asia Pacific (Tokyo)
                              </option>
                              <option value="ap-northeast-2">
                                Asia Pacific (Seoul)
                              </option>
                              <option value="ap-northeast-3">
                                Asia Pacific (Osaka)
                              </option>
                              <option value="ap-southeast-1">
                                Asia Pacific (Singapore)
                              </option>
                              <option value="ap-southeast-2">
                                Asia Pacific (Sydney)
                              </option>
                              <option value="ca-central-1">
                                Canada (Central)
                              </option>
                              <option value="eu-central-1">
                                Europe (Frankfurt)
                              </option>
                              <option value="eu-west-1">
                                Europe (Ireland)
                              </option>
                              <option value="eu-west-2">Europe (London)</option>
                              <option value="eu-west-3">Europe (Paris)</option>
                              <option value="eu-north-1">
                                Europe (Stockholm)
                              </option>
                              <option value="eu-south-1">Europe (Milan)</option>
                              <option value="me-south-1">
                                Middle East (Bahrain)
                              </option>
                              <option value="me-central-1">
                                Middle East (UAE)
                              </option>
                              <option value="sa-east-1">
                                South America (São Paulo)
                              </option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Access Key
                            </label>
                            <input
                              type="text"
                              value={s3Config.accessKey}
                              onChange={(e) =>
                                setS3Config((prev) => ({
                                  ...prev,
                                  accessKey: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base bg-white"
                              placeholder="AWS Access Key"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Secret Key
                            </label>
                            <div className="relative">
                              <input
                                type={showSecretKey ? "text" : "password"} // Toggle between text and password
                                value={s3Config.secretKey}
                                onChange={(e) =>
                                  setS3Config((prev) => ({
                                    ...prev,
                                    secretKey: e.target.value,
                                  }))
                                }
                                className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base bg-white"
                                placeholder="AWS Secret Key"
                              />
                              <div
                                className="absolute inset-y-0 right-3 flex items-center cursor-pointer"
                                onClick={() =>
                                  setShowSecretKey((prev) => !prev)
                                } // Toggle visibility
                              >
                                <i
                                  className={`fas ${
                                    showSecretKey ? "fa-eye-slash" : "fa-eye"
                                  } text-gray-500`}
                                ></i>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleS3Connect();
                          }}
                          disabled={
                            !s3Config.region ||
                            !s3Config.accessKey ||
                            !s3Config.secretKey ||
                            loading
                          }
                          className="w-full bg-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center font-medium disabled:bg-gray-400"
                        >
                          <i className="fab fa-aws mr-2"></i>Connect to AWS
                        </button>
                      </div>
                    ) : (
                      // S3 File Browser
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Bucket
                          </label>
                          <select
                            value={s3Config.bucket}
                            onChange={(e) => handleBucketSelect(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base bg-white"
                          >
                            <option value="">Select Bucket</option>
                            {buckets.map((bucket) => (
                              <option key={bucket.Name} value={bucket.Name}>
                                {bucket.Name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {s3Config.bucket && files.length > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Select File
                            </label>
                            <select
                              value={s3Config.filePath}
                              onChange={(e) =>
                                setS3Config((prev) => ({
                                  ...prev,
                                  filePath: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base bg-white"
                            >
                              <option value="">Select File</option>
                              {files.map((file) => (
                                <option key={file.Key} value={file.Key}>
                                  {file.Key} (
                                  {(file.Size / (1024 * 1024)).toFixed(2)} MB)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex justify-between">
                          <button
                            onClick={() => {
                              setIsS3Connected(false);
                              setS3Config({
                                region: "",
                                accessKey: "",
                                secretKey: "",
                                bucket: "",
                                filePath: "",
                              });
                              setBuckets([]);
                              setFiles([]);
                            }}
                            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
                          >
                            <i className="fas fa-redo mr-2"></i>Reset Connection
                          </button>

                          <button
                            onClick={handleS3FileSelect}
                            disabled={!s3Config.filePath || loading}
                            className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center font-medium disabled:bg-gray-400"
                          >
                            <i className="fas fa-cloud-download-alt mr-2"></i>
                            Process Selected File
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Identity Mapping */}
          {currentStep === 2 && (
            <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300">
              {!validationResults ? (
                // Initial identity mapping form (shown before validation)
                <>
                  <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
                    <i className="fas fa-fingerprint text-black mr-3"></i>Map
                    Identity Fields
                  </h2>

                  <div className="w-full h-px bg-gray-200 mb-6"></div>

                  <p className="text-gray-500 mb-6">
                    Please select which columns in your CSV file contain
                    identity information. Identity column is required for
                    validation.
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
                        Optional: Select the column containing email addresses
                        for validation
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
                      disabled={!identityColumn}
                    >
                      <i className="fas fa-check mr-2"></i>Validate Data
                    </button>
                  </div>
                </>
              ) : (
                // Validation results (shown after validation)
                <>
                  <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
                    <i className="fas fa-check-circle text-black mr-3"></i>
                    Validation Results
                  </h2>

                  <div className="w-full h-px bg-gray-200 mb-6"></div>

                  {/* Show validation results */}
                  <div
                    className={`mb-6 p-4 ${
                      validationResults.validationErrors
                        ? "bg-orange-50 text-orange-800 rounded-lg border border-orange-200"
                        : "bg-green-50 text-green-800 rounded-lg border border-green-200"
                    }`}
                  >
                    <div className="flex">
                      <i
                        className={`mr-2 text-xl ${
                          validationResults.validationErrors
                            ? "fas fa-exclamation-triangle"
                            : "fas fa-check-circle"
                        }`}
                      ></i>
                      <span className="font-medium">
                        CSV file processed!{" "}
                        {validationResults.validationErrors
                          ? "There are some validation issues, but you can still proceed."
                          : "Your data validated successfully."}
                      </span>
                    </div>
                    <div className="mt-4">
                      <span className="font-medium">Summary:</span>
                      <ul className="list-disc pl-5 mt-2">
                        <li>Total records: {totalRows}</li>
                        <li>
                          Valid records:{" "}
                          {validationResults.validRecordCount ||
                            (validationResults.validationErrors
                              ? 0
                              : totalRows)}
                        </li>
                        <li>Identity field: {identityColumn}</li>
                        {emailColumn && <li>Email field: {emailColumn}</li>}
                        {phoneColumn && <li>Phone field: {phoneColumn}</li>}
                      </ul>
                    </div>
                  </div>

                  {/* Show validation errors if present */}
                  {validationResults.validationErrors && (
                    <div className="mb-6 p-4 bg-orange-50 text-orange-800 rounded-lg border border-orange-200">
                      <div className="flex">
                        <i className="fas fa-exclamation-triangle mr-2 text-xl"></i>
                        <span className="font-medium">
                          Validation issues found. You can still proceed to
                          mapping.
                        </span>
                      </div>

                      <div className="mt-4">
                        {/* Identity & Contact Information Issues */}
                        <h4 className="font-medium text-red-800 mt-3 mb-1 border-l-4 border-red-400 pl-2">
                          Identity & Contact Information Issues
                        </h4>
                        <ul className="list-disc pl-5 mb-4">
                          {validationResults.validationErrors
                            .blankIdentityCount > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .blankIdentityCount
                                }
                              </span>{" "}
                              rows have blank, 0 or Null identity values.
                            </li>
                          )}

                          {validationResults.validationErrors.errorBreakdown
                            ?.emailErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.emailErrors
                                }
                              </span>{" "}
                              fields have invalid email formats.
                            </li>
                          )}

                          {validationResults.validationErrors.errorBreakdown
                            ?.phoneErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.phoneErrors
                                }
                              </span>{" "}
                              fields have invalid phone formats.
                            </li>
                          )}

                          {validationResults.validationErrors
                            .blankIdentityCount === 0 &&
                            !validationResults.validationErrors.errorBreakdown
                              ?.emailErrors &&
                            !validationResults.validationErrors.errorBreakdown
                              ?.phoneErrors && (
                              <li className="text-green-700">
                                No identity or contact information issues found.
                              </li>
                            )}
                        </ul>

                        {/* CSV Format Issues */}
                        <h4 className="font-medium text-red-800 mt-3 mb-1 border-l-4 border-red-400 pl-2">
                          CSV Format Issues
                        </h4>
                        <ul className="list-disc pl-5">
                          {validationResults.validationErrors.errorBreakdown
                            ?.quoteErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.quoteErrors
                                }
                              </span>{" "}
                              fields have unescaped quote characters.
                            </li>
                          )}

                          {validationResults.validationErrors.errorBreakdown
                            ?.commaErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.commaErrors
                                }
                              </span>{" "}
                              fields have unescaped commas.
                            </li>
                          )}

                          {validationResults.validationErrors.errorBreakdown
                            ?.newlineErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.newlineErrors
                                }
                              </span>{" "}
                              fields have line breaks.
                            </li>
                          )}

                          {validationResults.validationErrors.errorBreakdown
                            ?.controlCharErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.controlCharErrors
                                }
                              </span>{" "}
                              fields have control characters.
                            </li>
                          )}

                          {validationResults.validationErrors.errorBreakdown
                            ?.otherSpecialCharErrors > 0 && (
                            <li className="text-red-700">
                              <span className="font-medium">
                                {
                                  validationResults.validationErrors
                                    .errorBreakdown.otherSpecialCharErrors
                                }
                              </span>{" "}
                              fields have problematic special characters.
                            </li>
                          )}

                          {!validationResults.validationErrors.errorBreakdown
                            ?.quoteErrors &&
                            !validationResults.validationErrors.errorBreakdown
                              ?.commaErrors &&
                            !validationResults.validationErrors.errorBreakdown
                              ?.newlineErrors &&
                            !validationResults.validationErrors.errorBreakdown
                              ?.controlCharErrors &&
                            !validationResults.validationErrors.errorBreakdown
                              ?.otherSpecialCharErrors && (
                              <li className="text-green-700">
                                No CSV format issues found.
                              </li>
                            )}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Download buttons - only show when there are actual files to download */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {validationResults.validationErrors &&
                      validationResults.validationErrors.logFileUrl && (
                        <div>
                          <button
                            onClick={() =>
                              handleFileDownload(
                                validationResults.validationErrors.logFileUrl,
                                "validation_log"
                              )
                            }
                            className="w-full bg-gray-400 text-white px-4 py-3 rounded-lg hover:bg-gray-500 transition-colors flex items-center justify-center font-medium"
                          >
                            <i className="fas fa-download mr-2"></i>Download
                            Validation Log
                          </button>
                        </div>
                      )}

                    {validationResults.validEntriesUrl && (
                      <div>
                        <button
                          onClick={() =>
                            handleFileDownload(
                              validationResults.validEntriesUrl,
                              "valid_entries"
                            )
                          }
                          className="w-full bg-black text-white px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center font-medium"
                        >
                          <i className="fas fa-file-download mr-2"></i>Download
                          Valid CSV
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-8 flex justify-between">
                    <div className="space-x-4">
                      <button
                        onClick={() => {
                          // Reset validation results to go back to identity mapping form
                          setValidationResults(null);
                        }}
                        className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors flex items-center font-medium"
                      >
                        <i className="fas fa-redo mr-2"></i>Re-select Columns
                      </button>
                    </div>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center font-medium"
                    >
                      Continue to Mapping
                      <i className="fas fa-arrow-right ml-2"></i>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Validation Results */}
          {currentStep === 3 && renderValidationStep()}

          {/* Step 4: Files Generated */}
          {currentStep === 4 && renderFilesStep()}
        </div>
      )}

      <Footer />
    </div>
  );
}

export default SftpGenerator;
