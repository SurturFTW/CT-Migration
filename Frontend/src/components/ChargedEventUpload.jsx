import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Dropdown from "./common/Dropdown";
import Loading from "./common/Loading";
import AlertMessage from "./common/AlertMessage";
import FileUploader from "./common/FileUploader";
import Header from "./common/Header";
import Footer from "./common/Footer";
import {
  uploadCSV,
  previewEvents,
  uploadEventsWithProgress,
} from "../services/api";

function ChargedEventUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [columns, setColumns] = useState([]);
  const [columnMappings, setColumnMappings] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [clientEmail] = useState(localStorage.getItem("email") || "");
  const [accountName] = useState(localStorage.getItem("accountName"));
  const [accountId, setAccountId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [apiUrl, setApiUrl] = useState("https://api.clevertap.com/1/upload");

  const [specialMappings, setSpecialMappings] = useState({
    identityField: "",
    identityFieldMapping: "identity",
    identityFieldType: "string",
    timestampField: "",
    timestampFieldMapping: "ts",
    timestampFieldType: "integer",
    groupByField: "",
    groupByFieldMapping: "",
    groupByFieldType: "string",
  });

  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [uploadLogs, setUploadLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState(null);

  // Header right content
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

  const LogViewer = ({ logs, onClose }) => {
    const logEndRef = useRef(null);

    // Auto-scroll to bottom when logs update
    useEffect(() => {
      if (logEndRef.current) {
        logEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, [logs]);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl">
            <h2 className="text-xl font-semibold flex items-center">
              <i className="fas fa-terminal mr-2 text-gray-700"></i>
              Upload Progress Logs
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 bg-gray-900 font-mono text-sm">
            {logs.map((log, index) => (
              <div key={index} className="mb-1">
                <span className="text-gray-400">[{log.timestamp}]</span>{" "}
                <span
                  className={
                    log.message.includes("✅")
                      ? "text-green-400"
                      : log.message.includes("❌")
                      ? "text-red-400"
                      : log.message.includes("🚀")
                      ? "text-blue-400"
                      : log.message.includes("📦")
                      ? "text-yellow-400"
                      : "text-gray-200"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {logs.length} log entries
              </span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-black text-white rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Handle file upload
  const handleFileChange = (uploadedFile) => {
    if (!uploadedFile) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    setFile(uploadedFile);
    setSelectedFileName(uploadedFile.name);
    setErrorMessage("");
  };

  const handlePreview = async () => {
    if (!file) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    if (
      !specialMappings.identityField ||
      !specialMappings.timestampField ||
      !specialMappings.groupByField
    ) {
      setErrorMessage("Please select all required special fields");
      return;
    }

    try {
      setPreviewLoading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(getEventMapping()));
      formData.append("itemsFields", JSON.stringify(getItemsFields()));
      formData.append("groupByField", specialMappings.groupByField);
      // Add special fields information including the groupByFieldMapping
      formData.append("specialFields", JSON.stringify(specialMappings));

      // Use the API service function
      const data = await previewEvents(formData);
      setPreviewData(data);
      setShowPreview(true);
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error.message || "Error generating preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Helper functions to organize mappings (reused in both preview and submit)
  const getEventMapping = () => {
    const eventMapping = {};

    // Add special field mappings
    if (specialMappings.identityField) {
      eventMapping[specialMappings.identityField] = {
        fieldName: specialMappings.identityFieldMapping || "identity",
        type: specialMappings.identityFieldType || "string",
      };
    }

    if (specialMappings.timestampField) {
      eventMapping[specialMappings.timestampField] = {
        fieldName: specialMappings.timestampFieldMapping || "ts",
        type: specialMappings.timestampFieldType || "integer",
      };
    }

    if (specialMappings.groupByField && specialMappings.groupByFieldMapping) {
      eventMapping[specialMappings.groupByField] = {
        fieldName: specialMappings.groupByFieldMapping,
        type: specialMappings.groupByFieldType || "string",
      };
    }

    // Process regular column mappings
    columnMappings.forEach((mapping) => {
      // Skip ignored fields and special fields
      if (
        mapping.type === "ignore" ||
        mapping.type === "item" ||
        mapping.csv_name === specialMappings.identityField ||
        mapping.csv_name === specialMappings.timestampField ||
        mapping.csv_name === specialMappings.groupByField
      ) {
        return;
      }

      const targetField =
        "evtData." + (mapping.clevertap_name || mapping.csv_name);
      eventMapping[mapping.csv_name] = {
        fieldName: targetField,
        type: mapping.type || "string",
      };
    });

    return eventMapping;
  };

  const getItemsFields = () => {
    const itemsFields = [];

    columnMappings.forEach((mapping) => {
      if (mapping.type === "item") {
        itemsFields.push({
          source: mapping.csv_name,
          target: mapping.clevertap_name || mapping.csv_name,
          type: mapping.dataType || "string",
        });
      }
    });

    return itemsFields;
  };

  // Handle file error
  const handleFileError = (error) => {
    setErrorMessage(error);
  };

  // Special mappings handler
  const handleSpecialMappingChange = (field, value) => {
    setSpecialMappings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle form submission for the first step (file upload)
  const handleFirstStepSubmit = async () => {
    if (!file) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", file);

      // Use the API service function
      const data = await uploadCSV(formData);

      // Set columns first
      const receivedColumns = data.columns || [];
      setColumns(receivedColumns);

      // Then immediately set the column mappings
      const initialMappings = receivedColumns.map((column) => ({
        csv_name: column,
        clevertap_name: column,
        type: "string", // Default type for event data properties
        dataType: "string", // Always include dataType for potential item fields
      }));
      setColumnMappings(initialMappings);

      // Move to next step
      setCurrentStep(2);
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error.message || "Error processing the file");
    } finally {
      setLoading(false);
    }
  };

  // Handle submit for the second step (column mapping)
  // Update handleSubmit function
  const handleSubmit = async () => {
    if (!file) {
      setErrorMessage("Please select a CSV file");
      return;
    }

    if (!accountId || !passcode) {
      setErrorMessage("Please provide CleverTap Account ID and Passcode");
      return;
    }

    if (
      !specialMappings.identityField ||
      !specialMappings.timestampField ||
      !specialMappings.groupByField
    ) {
      setErrorMessage("Please select all required special fields");
      return;
    }

    try {
      setLoading(true);
      setUploadLogs([]);
      setShowLogs(true);

      // Add initial log
      addLog(`📊 Starting upload for ${selectedFileName}`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", accountId);
      formData.append("passcode", passcode);
      formData.append("apiUrl", apiUrl);
      formData.append("mapping", JSON.stringify(getEventMapping()));
      formData.append("itemsFields", JSON.stringify(getItemsFields()));
      formData.append("groupByField", specialMappings.groupByField);
      formData.append("specialFields", JSON.stringify(specialMappings));
      formData.append(
        "headers",
        JSON.stringify({
          "X-CleverTap-Account-Id": accountId,
          "X-CleverTap-Passcode": passcode,
          "Content-Type": "application/json",
        })
      );

      // Use the modified uploadEvents function that handles logs
      const response = await uploadEventsWithProgress(
        formData,
        (log, progress) => {
          addLog(log);
          setUploadProgress(progress || 0);
        }
      );

      setUploadStats(response);
      setSuccessMessage("Events uploaded successfully");
      setCurrentStep(3);
    } catch (error) {
      console.error("Error:", error);
      addLog(`❌ Error: ${error.message}`);
      setErrorMessage(error.message || "Error processing the file");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to add logs with timestamp
  const addLog = (message) => {
    setUploadLogs((prevLogs) => [
      ...prevLogs,
      {
        message,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const PreviewModal = ({ data, onClose }) => {
    if (!data) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          {/* Header - Fixed */}
          <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl">
            <h2 className="text-xl font-semibold flex items-center">
              <i className="fas fa-eye mr-2 text-gray-700"></i>
              Preview Charged Events
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100"
              aria-label="Close"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          {/* Scrollable Content Container */}
          <div className="overflow-y-auto flex-1">
            <div className="p-4">
              <div className="mb-4">
                <p className="text-gray-600">
                  Showing {data.previewEvents.length} events from your data.
                  These events will be uploaded as "Charged" events to
                  CleverTap.
                </p>

                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="bg-gray-100 rounded-xl p-4">
                    <div className="text-sm text-gray-500">Total CSV Rows</div>
                    <div className="text-xl font-semibold">
                      {data.totalRowsInFile}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <div className="text-sm text-blue-600">Unique Events</div>
                    <div className="text-xl font-semibold text-blue-700">
                      {data.uniqueEventsCount}
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                    <div className="text-sm text-green-600">Unique Users</div>
                    <div className="text-xl font-semibold text-green-700">
                      {data.uniqueIdentitiesCount}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h3 className="font-medium text-blue-800 mb-2 flex items-center">
                  <i className="fas fa-info-circle mr-2"></i>
                  Understanding The Preview
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-blue-800">
                  <li>
                    <span className="font-medium">Identity field</span>: Used to
                    identify the user
                  </li>
                  <li>
                    <span className="font-medium">Timestamp (ts) field</span>:
                    When the transaction occurred
                  </li>
                  <li>
                    <span className="font-medium">Event Name</span>: Always
                    "Charged" for purchase events
                  </li>
                  <li>
                    <span className="font-medium">evtData properties</span>:
                    Transaction-level properties like Amount, Currency
                  </li>
                  <li>
                    <span className="font-medium">Items array</span>: Contains
                    all products in this transaction
                  </li>
                </ul>
              </div>

              <div className="space-y-6">
                {data.previewEvents.map((event, index) => (
                  <div
                    key={index}
                    className="border rounded-xl overflow-hidden shadow-sm"
                  >
                    <div className="bg-gray-100 p-3 border-b border-gray-200">
                      <h3 className="font-medium">
                        Charged Event #{index + 1}
                      </h3>
                    </div>

                    <div className="p-0">
                      {/* Event Metadata */}
                      <div className="bg-gray-50 p-3 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="flex items-center">
                          <span className="px-2 py-1 text-xs rounded-xl bg-blue-100 text-blue-800 mr-2">
                            Identity
                          </span>
                          <span className="text-sm font-mono truncate max-w-[180px]">
                            {event.identity}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="px-2 py-1 text-xs rounded-xl bg-blue-100 text-blue-800 mr-2">
                            Timestamp
                          </span>
                          <span className="text-sm font-mono">{event.ts}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="px-2 py-1 text-xs rounded-xl bg-purple-100 text-purple-800 mr-2">
                            Event
                          </span>
                          <span className="text-sm font-mono">
                            {event.evtName}
                          </span>
                        </div>
                      </div>

                      <div className="p-3">
                        {/* Event Properties */}
                        <h4 className="text-sm font-medium mb-2 text-gray-700">
                          Event Properties:
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <pre className="bg-gray-100 p-3 text-sm max-h-40 overflow-y-auto font-mono whitespace-pre">
                            {JSON.stringify(event.evtData, null, 2)}
                          </pre>
                        </div>

                        {/* Items Table */}
                        {event.evtData?.Items &&
                          event.evtData.Items.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-medium mb-2 text-gray-700">
                                Items ({event.evtData.Items.length}):
                              </h4>
                              <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                  <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        {Object.keys(
                                          event.evtData.Items[0]
                                        ).map((key) => (
                                          <th
                                            key={key}
                                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                                          >
                                            {key}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {event.evtData.Items.map(
                                        (item, itemIdx) => (
                                          <tr key={itemIdx}>
                                            {Object.values(item).map(
                                              (value, valueIdx) => (
                                                <td
                                                  key={valueIdx}
                                                  className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 font-mono"
                                                >
                                                  {typeof value === "number" ? (
                                                    <span className="text-green-600">
                                                      {value}
                                                    </span>
                                                  ) : (
                                                    String(value)
                                                  )}
                                                </td>
                                              )
                                            )}
                                          </tr>
                                        )
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer with action button */}
          <div className="p-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-xl">
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-all flex items-center"
              >
                <i className="fas fa-check mr-2"></i>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFileUploadStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
        <i className="fas fa-file-upload text-black mr-3"></i>Upload CSV File
      </h2>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <FileUploader
          accept=".csv"
          supportedFormats="CSV files"
          onFileSelect={handleFileChange}
          onError={handleFileError}
        />

        {selectedFileName && (
          <div className="mt-4 flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center space-x-3">
              <i className="fas fa-file-csv text-gray-500 text-lg"></i>
              <div>
                <span className="font-medium text-gray-700">
                  {selectedFileName}
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {file?.size
                    ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                    : ""}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setSelectedFileName("");
              }}
              className="text-gray-400 hover:text-gray-600"
              title="Remove file"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all shadow-sm flex items-center"
        >
          <i className="fas fa-times mr-2"></i>Cancel
        </button>
        <button
          onClick={handleFirstStepSubmit}
          disabled={!file || loading}
          className="px-6 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm flex items-center"
        >
          {loading ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2"></i>Processing...
            </>
          ) : (
            <>
              Continue<i className="fas fa-arrow-right ml-2"></i>
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderColumnMappingStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
        <i className="fas fa-exchange-alt text-black mr-3"></i>Map Data
      </h2>

      {/* File information banner */}
      <div className="mb-5 p-4 bg-gray-100 text-gray-800 rounded-xl border border-gray-200">
        <div className="flex items-center">
          <i className="fas fa-file-csv mr-3 text-lg"></i>
          <div>
            <span className="font-medium">File:</span> {selectedFileName}
            <p className="text-sm mt-1">Total columns: {columns.length}</p>
          </div>
        </div>
      </div>

      <AlertMessage
        type="info"
        message="Map your CSV columns to CleverTap event properties. The event type will be 'Charged'. Configure special field mappings below."
      />

      {/* Special fields mappings section */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center">
          <i className="fas fa-key mr-2 text-gray-600"></i>
          Special Field Mappings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Identity Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Identity Field <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <select
                value={specialMappings.identityField}
                onChange={(e) =>
                  handleSpecialMappingChange("identityField", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              >
                <option value="">Select a field</option>
                {columns.map((column) => (
                  <option key={`identity-${column}`} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={specialMappings.identityFieldMapping || "identity"}
                  onChange={(e) =>
                    handleSpecialMappingChange(
                      "identityFieldMapping",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  placeholder="CleverTap field name"
                />
                <select
                  value={specialMappings.identityFieldType || "string"}
                  onChange={(e) =>
                    handleSpecialMappingChange(
                      "identityFieldType",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                >
                  <option value="string">String</option>
                  <option value="integer">Integer</option>
                  <option value="float">Float</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Maps to CleverTap's identity field (Required)
            </p>
          </div>

          {/* Timestamp Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timestamp Field <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <select
                value={specialMappings.timestampField}
                onChange={(e) =>
                  handleSpecialMappingChange("timestampField", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              >
                <option value="">Select a field</option>
                {columns.map((column) => (
                  <option key={`timestamp-${column}`} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={specialMappings.timestampFieldMapping || "ts"}
                  onChange={(e) =>
                    handleSpecialMappingChange(
                      "timestampFieldMapping",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  placeholder="CleverTap field name"
                />
                <select
                  value={specialMappings.timestampFieldType || "integer"}
                  onChange={(e) =>
                    handleSpecialMappingChange(
                      "timestampFieldType",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                >
                  <option value="integer">Integer</option>
                  <option value="string">String</option>
                  <option value="float">Float</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Maps to CleverTap's timestamp field (Required)
            </p>
          </div>

          {/* Group By Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group By Field <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <select
                value={specialMappings.groupByField}
                onChange={(e) =>
                  handleSpecialMappingChange("groupByField", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              >
                <option value="">Select a field</option>
                {columns.map((column) => (
                  <option key={`groupby-${column}`} value={column}>
                    {column}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={specialMappings.groupByFieldMapping || ""}
                  onChange={(e) =>
                    handleSpecialMappingChange(
                      "groupByFieldMapping",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                  placeholder="CleverTap field name (optional)"
                />
                <select
                  value={specialMappings.groupByFieldType || "string"}
                  onChange={(e) =>
                    handleSpecialMappingChange(
                      "groupByFieldType",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                >
                  <option value="string">String</option>
                  <option value="integer">Integer</option>
                  <option value="float">Float</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Used to group related items into one transaction (Required)
            </p>
          </div>
        </div>
      </div>

      {/* Column mapping table with enhanced styling */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h4 className="font-medium text-gray-700 flex items-center">
            <i className="fas fa-columns mr-2 text-indigo-500"></i>
            Column Selection
          </h4>
          <p className="text-sm text-gray-600 mt-1">
            Select columns to map as Event Data Properties or Item Fields
          </p>
        </div>

        <div className="p-4">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CSV Column
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assignment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CleverTap Field Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Type
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {columns
                .filter(
                  (column) =>
                    column !== specialMappings.identityField &&
                    column !== specialMappings.timestampField &&
                    column !== specialMappings.groupByField
                )
                .map((column, index) => {
                  // Find the mapping for this column
                  const mapping = columnMappings.find(
                    (m) => m.csv_name === column
                  ) || {
                    csv_name: column,
                    clevertap_name: column,
                    type: "string",
                  };

                  return (
                    <tr
                      key={index}
                      className={mapping.type === "ignore" ? "bg-gray-50" : ""}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {column}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex space-x-2">
                          {/* EVENT DATA BUTTON */}
                          <button
                            className={`px-2 py-1 text-xs rounded-full flex items-center ${
                              mapping.type !== "item" &&
                              mapping.type !== "ignore"
                                ? "bg-blue-500 text-white"
                                : "bg-gray-200 text-gray-600"
                            } shadow-sm`}
                            onClick={() => {
                              const newMappings = [...columnMappings];
                              const existingIndex = newMappings.findIndex(
                                (m) => m.csv_name === column
                              );

                              if (existingIndex >= 0) {
                                // Set type to a data type (string by default)
                                newMappings[existingIndex].type = "string";
                                // Keep dataType for potential future use
                                if (!newMappings[existingIndex].dataType) {
                                  newMappings[existingIndex].dataType =
                                    "string";
                                }
                              } else {
                                newMappings.push({
                                  csv_name: column,
                                  clevertap_name: column,
                                  type: "string",
                                  dataType: "string", // Store for reference
                                });
                              }

                              setColumnMappings(newMappings);
                            }}
                          >
                            <i
                              className={`fas fa-tag mr-1 ${
                                mapping.type !== "item" &&
                                mapping.type !== "ignore"
                                  ? ""
                                  : "opacity-50"
                              }`}
                            ></i>
                            Event Data
                          </button>

                          {/* ITEM FIELD BUTTON */}
                          <button
                            className={`px-2 py-1 text-xs rounded-full flex items-center ${
                              mapping.type === "item"
                                ? "bg-orange-500 text-white"
                                : "bg-gray-200 text-gray-600"
                            } shadow-sm`}
                            onClick={() => {
                              const newMappings = [...columnMappings];
                              const existingIndex = newMappings.findIndex(
                                (m) => m.csv_name === column
                              );

                              if (existingIndex >= 0) {
                                // Set type to "item"
                                newMappings[existingIndex].type = "item";

                                // Set dataType based on previous type if available
                                if (!newMappings[existingIndex].dataType) {
                                  if (
                                    [
                                      "string",
                                      "integer",
                                      "float",
                                      "boolean",
                                    ].includes(newMappings[existingIndex].type)
                                  ) {
                                    newMappings[existingIndex].dataType =
                                      newMappings[existingIndex].type;
                                  } else {
                                    newMappings[existingIndex].dataType =
                                      "string";
                                  }
                                }
                              } else {
                                newMappings.push({
                                  csv_name: column,
                                  clevertap_name: column,
                                  type: "item",
                                  dataType: "string",
                                });
                              }

                              setColumnMappings(newMappings);
                            }}
                          >
                            <i
                              className={`fas fa-shopping-cart mr-1 ${
                                mapping.type === "item" ? "" : "opacity-50"
                              }`}
                            ></i>
                            Item Field
                          </button>

                          {/* IGNORE BUTTON */}
                          <button
                            className={`px-2 py-1 text-xs rounded-full flex items-center ${
                              mapping.type === "ignore"
                                ? "bg-gray-500 text-white"
                                : "bg-gray-200 text-gray-600"
                            } shadow-sm`}
                            onClick={() => {
                              const newMappings = [...columnMappings];
                              const existingIndex = newMappings.findIndex(
                                (m) => m.csv_name === column
                              );

                              if (existingIndex >= 0) {
                                // Set type to "ignore"
                                newMappings[existingIndex].type = "ignore";

                                // Keep dataType for reference in case we switch back
                                if (!newMappings[existingIndex].dataType) {
                                  newMappings[existingIndex].dataType =
                                    "string";
                                }
                              } else {
                                newMappings.push({
                                  csv_name: column,
                                  clevertap_name: column,
                                  type: "ignore",
                                  dataType: "string", // Keep for reference
                                });
                              }

                              setColumnMappings(newMappings);
                            }}
                          >
                            <i
                              className={`fas fa-ban mr-1 ${
                                mapping.type === "ignore" ? "" : "opacity-50"
                              }`}
                            ></i>
                            Ignore
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="text"
                          className={`w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all ${
                            mapping.type === "ignore" ? "bg-gray-100" : ""
                          }`}
                          value={mapping.clevertap_name || column}
                          disabled={mapping.type === "ignore"}
                          onChange={(e) => {
                            const newMappings = [...columnMappings];
                            const existingIndex = newMappings.findIndex(
                              (m) => m.csv_name === column
                            );

                            if (existingIndex >= 0) {
                              newMappings[existingIndex].clevertap_name =
                                e.target.value;
                            } else {
                              newMappings.push({
                                csv_name: column,
                                clevertap_name: e.target.value,
                                type: mapping.type || "string",
                              });
                            }

                            setColumnMappings(newMappings);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <select
                          className={`w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all ${
                            mapping.type === "ignore" ? "bg-gray-100" : ""
                          }`}
                          value={
                            mapping.type === "item"
                              ? mapping.dataType || "string"
                              : mapping.type === "ignore"
                              ? "string"
                              : mapping.type || "string"
                          }
                          disabled={mapping.type === "ignore"}
                          onChange={(e) => {
                            const newMappings = [...columnMappings];
                            const existingIndex = newMappings.findIndex(
                              (m) => m.csv_name === column
                            );

                            if (existingIndex >= 0) {
                              if (mapping.type === "item") {
                                // For item fields, update the dataType property
                                newMappings[existingIndex].dataType =
                                  e.target.value;
                              } else if (mapping.type !== "ignore") {
                                // For event data properties, update the type property
                                newMappings[existingIndex].type =
                                  e.target.value;
                              }
                            } else {
                              // Add a new mapping if it doesn't exist
                              newMappings.push({
                                csv_name: column,
                                clevertap_name: column,
                                type:
                                  mapping.type === "item"
                                    ? "item"
                                    : e.target.value,
                                dataType:
                                  mapping.type === "item"
                                    ? e.target.value
                                    : undefined,
                              });
                            }

                            setColumnMappings(newMappings);
                          }}
                        >
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="float">Float</option>
                          <option value="boolean">Boolean</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credentials section */}
      <div className="space-y-4 mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
        <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center">
          <i className="fas fa-lock mr-2 text-gray-600"></i>
          CleverTap Credentials
        </h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CleverTap Account ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
            placeholder="Enter your CleverTap Account ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CleverTap Account Passcode <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
            placeholder="Enter API URL (defaults to CleverTap API)"
          />
        </div>
      </div>

      {/* Add the preview modal */}
      {showPreview && (
        <PreviewModal
          data={previewData}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Update the buttons at the bottom */}
      <div className="flex justify-end space-x-4">
        <button
          onClick={() => setCurrentStep(1)}
          className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
        >
          Back
        </button>

        <button
          onClick={handlePreview}
          disabled={
            previewLoading ||
            columnMappings.length === 0 ||
            !specialMappings.identityField ||
            !specialMappings.timestampField ||
            !specialMappings.groupByField
          }
          className="px-6 py-2.5 border border-black text-black rounded-xl hover:bg-gray-50 transition-all disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
        >
          {previewLoading ? "Generating..." : "Preview Events"}
        </button>

        <button
          onClick={handleSubmit}
          disabled={
            loading ||
            columnMappings.length === 0 ||
            !accountId ||
            !passcode ||
            !specialMappings.identityField ||
            !specialMappings.timestampField ||
            !specialMappings.groupByField
          }
          className="px-6 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? "Processing..." : "Upload Events"}
        </button>
      </div>
    </div>
  );

  // Update the renderSuccessStep function to show detailed stats
  const renderSuccessStep = () => (
    <div className="text-center p-8 space-y-6">
      <div className="text-green-500 text-6xl mb-6">
        <i className="fas fa-check-circle"></i>
      </div>
      <h3 className="text-2xl font-medium text-gray-800">Upload Successful!</h3>
      <p className="text-gray-600 mb-4">
        Your charged events have been uploaded to CleverTap.
      </p>

      {uploadStats && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm max-w-2xl mx-auto mb-6">
          <div className="p-4 bg-gray-50 border-b border-gray-200 text-left">
            <h3 className="font-medium">Upload Statistics</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-600">Total Events</p>
                <p className="text-xl font-semibold text-blue-700">
                  {uploadStats.totalEvents}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                <p className="text-sm text-green-600">Total Batches</p>
                <p className="text-xl font-semibold text-green-700">
                  {uploadStats.batches}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-xl border border-green-100">
                <p className="text-sm text-green-600">Successful Batches</p>
                <p className="text-xl font-semibold text-green-700">
                  {uploadStats.successfulBatches}
                </p>
              </div>
              <div
                className={`p-3 rounded-xl border ${
                  uploadStats.failedBatches > 0
                    ? "bg-red-50 border-red-100"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <p
                  className={`text-sm ${
                    uploadStats.failedBatches > 0
                      ? "text-red-600"
                      : "text-gray-600"
                  }`}
                >
                  Failed Batches
                </p>
                <p
                  className={`text-xl font-semibold ${
                    uploadStats.failedBatches > 0
                      ? "text-red-700"
                      : "text-gray-700"
                  }`}
                >
                  {uploadStats.failedBatches}
                </p>
              </div>
            </div>

            <div className="text-left mb-4">
              <p className="text-sm text-gray-600">File: {selectedFileName}</p>
              <p className="text-sm text-gray-600">
                Processing Time: {uploadStats.processingTime || "N/A"}
              </p>
            </div>

            {uploadStats.failedBatchesLogUrl && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-left mb-4">
                <p className="flex items-center text-yellow-800">
                  <i className="fas fa-exclamation-triangle mr-2"></i>
                  Some batches failed during upload
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  <a
                    href={uploadStats.failedBatchesLogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-yellow-900"
                  >
                    Download failed batches log
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center space-x-4">
        <button
          onClick={() => setShowLogs(true)}
          className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all shadow-sm flex items-center"
        >
          <i className="fas fa-list-ul mr-2"></i>View Upload Logs
        </button>

        <button
          onClick={() => {
            // Reset state...
          }}
          className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-all shadow-sm flex items-center"
        >
          <i className="fas fa-redo mr-2"></i>Upload Another File
        </button>

        <button
          onClick={() => navigate("/dashboard")}
          className="px-6 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-all shadow-sm flex items-center"
        >
          <i className="fas fa-th-large mr-2"></i>Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header rightContent={headerRightContent} />

      <div className="flex-grow flex items-center justify-center py-8 px-4">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-10 text-center">
            <h1 className="text-4xl font-bold text-black mb-3">
              Upload Charged Events
            </h1>
            <p className="text-lg text-gray-600">
              Transform your transaction data into CleverTap charged events
            </p>
          </div>

          {/* Progress Steps - Enhanced version */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-8 px-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold mb-2 ${
                    currentStep >= 1
                      ? "bg-black text-white"
                      : "bg-gray-300 text-gray-500"
                  } shadow-sm transition-all duration-300`}
                >
                  {currentStep > 1 ? <i className="fas fa-check"></i> : 1}
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
                className={`h-1 flex-grow mx-2 rounded-full ${
                  currentStep >= 2 ? "bg-black" : "bg-gray-300"
                } transition-all duration-300`}
              ></div>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold mb-2 ${
                    currentStep >= 2
                      ? "bg-black text-white"
                      : "bg-gray-300 text-gray-500"
                  } shadow-sm transition-all duration-300`}
                >
                  {currentStep > 2 ? <i className="fas fa-check"></i> : 2}
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
                className={`h-1 flex-grow mx-2 rounded-full ${
                  currentStep >= 3 ? "bg-black" : "bg-gray-300"
                } transition-all duration-300`}
              ></div>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold mb-2 ${
                    currentStep >= 3
                      ? "bg-black text-white"
                      : "bg-gray-300 text-gray-500"
                  } shadow-sm transition-all duration-300`}
                >
                  3
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 3 ? "text-black" : "text-gray-500"
                  }`}
                >
                  Complete
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 transition-all duration-300 hover:shadow-lg">
            <div className="p-6">
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

              {/* Show loading indicator if loading is true, otherwise show content */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loading message="Processing your request..." />

                  {uploadProgress > 0 && (
                    <div className="w-64 mt-6">
                      <div className="text-sm text-gray-600 mb-1 flex justify-between">
                        <span>Upload Progress</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>

                      <button
                        onClick={() => setShowLogs(true)}
                        className="w-full mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 flex items-center justify-center"
                      >
                        <i className="fas fa-terminal mr-2"></i>
                        Show Upload Logs
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Step Content */}
                  {currentStep === 1 && renderFileUploadStep()}
                  {currentStep === 2 && renderColumnMappingStep()}
                  {currentStep === 3 && renderSuccessStep()}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showLogs && (
        <LogViewer logs={uploadLogs} onClose={() => setShowLogs(false)} />
      )}

      <Footer />
    </div>
  );
}

// Export the component
export default ChargedEventUpload;
