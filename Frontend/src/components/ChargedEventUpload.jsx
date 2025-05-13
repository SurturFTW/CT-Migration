import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Dropdown from "./common/Dropdown";
import Loading from "./common/Loading";
import AlertMessage from "./common/AlertMessage";
import ColumnMapping from "./common/ColumnMapping";

function ChargedEventUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [columns, setColumns] = useState([]);
  // Initialize columnMappings with an empty array of mappings
  const [columnMappings, setColumnMappings] = useState([]);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [clientEmail] = useState(localStorage.getItem("email") || "");
  const [accountName] = useState(localStorage.getItem("accountName"));
  const [accountId, setAccountId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [apiUrl, setApiUrl] = useState("https://api.clevertap.com/1/upload");

  // Handle column mappings update
  const handleMappingsUpdate = useCallback((updatedMappings) => {
    setColumnMappings(updatedMappings);
  }, []);

  // Handle file upload
  const handleFileChange = (uploadedFile) => {
    if (!uploadedFile) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    if (!uploadedFile.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("Please upload a valid CSV file");
      return;
    }

    setFile(uploadedFile);
    setSelectedFileName(uploadedFile.name);
    setErrorMessage("");
  };

  // Handle file submission and process steps
  const handleSubmit = async () => {
    if (!file) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", file);

      if (currentStep === 1) {
        // First step - Check credentials before proceeding
        if (!accountId || !passcode) {
          setErrorMessage("Please provide CleverTap Account ID and Passcode");
          setLoading(false);
          return;
        }

        // Upload and validate file
        const response = await fetch("http://localhost:5000/api/upload_csv", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          // Set the columns - the useEffect will handle creating initial mappings
          setColumns(data.columns || []);
          setCurrentStep(2);
        } else {
          throw new Error(data.error || "Error uploading file");
        }
      } else if (currentStep === 2) {
        // Second step - upload with column mapping
        if (!accountId || !passcode) {
          setErrorMessage("Please provide CleverTap Account ID and Passcode");
          return;
        }

        // Prepare the mapping for charged event
        const eventMapping = {};
        columnMappings.forEach((mapping) => {
          let targetField = mapping.clevertap_name;
          if (mapping.type === "number") {
            targetField = "evtData." + mapping.clevertap_name;
          } else if (mapping.type === "object" || mapping.type === "array") {
            targetField = "Items";
          }
          eventMapping[mapping.csv_name] = targetField;
        });

        formData.append("accountId", accountId);
        formData.append("passcode", passcode);
        formData.append("apiUrl", apiUrl);
        formData.append("mapping", JSON.stringify(eventMapping));
        formData.append(
          "headers",
          JSON.stringify({
            "X-CleverTap-Account-Id": accountId,
            "X-CleverTap-Passcode": passcode,
            "Content-Type": "application/json",
          })
        );

        const response = await fetch("http://localhost:5000/api/upload_event", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setSuccessMessage("File uploaded successfully");
          setCurrentStep(3);
        } else {
          throw new Error(data.error || "Error uploading file");
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error.message || "Error processing the file");
    } finally {
      setLoading(false);
    }
  };

  // Set up initial column mappings when columns are loaded
  useEffect(() => {
    if (columns.length > 0) {
      const initialMappings = columns.map((column) => ({
        csv_name: column,
        clevertap_name: column,
        type: "string",
      }));
      setColumnMappings(initialMappings);
    }
  }, [columns]);

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
        handleFileChange(droppedFile);
      }
    };

    if (dropZone) {
      dropZone.addEventListener("dragover", handleDragOver);
      dropZone.addEventListener("dragleave", handleDragLeave);
      dropZone.addEventListener("drop", handleDrop);

      return () => {
        dropZone.removeEventListener("dragover", handleDragOver);
        dropZone.removeEventListener("dragleave", handleDragLeave);
        dropZone.removeEventListener("drop", handleDrop);
      };
    }
  }, []);

  const renderFileUploadStep = () => (
    <div className="space-y-6">
      <div
        ref={dropZoneRef}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv"
          onChange={(e) => handleFileChange(e.target.files?.[0])}
        />
        <div className="space-y-4">
          <i className="fas fa-cloud-upload-alt text-4xl text-gray-400"></i>
          <div>
            <p className="text-gray-600">
              Drag and drop your CSV file here, or{" "}
              <span className="text-blue-500 hover:text-blue-600 cursor-pointer">
                browse
              </span>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Only CSV files are supported
            </p>
          </div>
        </div>
      </div>

      {selectedFileName && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <i className="fas fa-file-csv text-gray-500"></i>
            <span className="text-gray-700">{selectedFileName}</span>
          </div>
          <button
            onClick={() => {
              setFile(null);
              setSelectedFileName("");
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CleverTap Account ID
          </label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Enter your CleverTap Account ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CleverTap Account Passcode
          </label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Enter your CleverTap Account Passcode"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API URL (Optional)
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Enter API URL (defaults to CleverTap API)"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!file || !accountId || !passcode || loading}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Upload"}
        </button>
      </div>
    </div>
  );

  const renderColumnMappingStep = () => (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <p className="text-yellow-800">
          <i className="fas fa-info-circle mr-2"></i>
          Map your CSV columns to CleverTap event properties. The event type
          will be "Charged".
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CleverTap Account ID
          </label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Enter your CleverTap Account ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CleverTap Account Passcode
          </label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Enter your CleverTap Account Passcode"
          />
        </div>
      </div>

      <ColumnMapping
        columns={columns}
        initialMappings={columnMappings}
        onMappingsChange={handleMappingsUpdate}
      />

      <div className="flex justify-end space-x-4">
        <button
          onClick={() => setCurrentStep(1)}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={
            loading || columnMappings.length === 0 || !accountId || !passcode
          }
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Upload Events"}
        </button>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center space-y-6">
      <div className="text-green-500 text-6xl">
        <i className="fas fa-check-circle"></i>
      </div>
      <h3 className="text-2xl font-medium text-gray-800">Upload Successful!</h3>
      <p className="text-gray-600">
        Your charged events have been uploaded to CleverTap.
      </p>
      <div className="flex justify-center space-x-4">
        <button
          onClick={() => {
            setFile(null);
            setSelectedFileName("");
            setCurrentStep(1);
            setErrorMessage("");
            setSuccessMessage("");
          }}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Upload Another File
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-800">
              Upload Charged Events
            </h1>
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
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
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
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step === currentStep
                        ? "bg-blue-500 text-white"
                        : step < currentStep
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {step < currentStep ? (
                      <i className="fas fa-check"></i>
                    ) : (
                      step
                    )}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-24 h-1 mx-2 ${
                        step < currentStep ? "bg-green-500" : "bg-gray-200"
                      }`}
                    ></div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center space-x-20 mt-2">
              <span className="text-sm text-gray-600">Upload File</span>
              <span className="text-sm text-gray-600">Map Columns</span>
              <span className="text-sm text-gray-600">Complete</span>
            </div>
          </div>

          {/* Error/Success Messages */}
          {errorMessage && (
            <AlertMessage
              type="error"
              message={errorMessage}
              onClose={() => setErrorMessage("")}
            />
          )}
          {successMessage && (
            <AlertMessage
              type="success"
              message={successMessage}
              onClose={() => setSuccessMessage("")}
            />
          )}

          {/* Loading Overlay */}
          {loading && <Loading />}

          {/* Step Content */}
          {currentStep === 1 && renderFileUploadStep()}
          {currentStep === 2 && renderColumnMappingStep()}
          {currentStep === 3 && renderSuccessStep()}
        </div>
      </div>
    </div>
  );
}

export default ChargedEventUpload;
