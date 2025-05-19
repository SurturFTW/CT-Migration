import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Dropdown from "./common/Dropdown";
import Loading from "./common/Loading";
import AlertMessage from "./common/AlertMessage";
import FileUploader from "./common/FileUploader";
import { uploadCSV, previewEvents, uploadEvents } from "../services/api";

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
    timestampField: "",
    groupByField: "",
  });

  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

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
      eventMapping[specialMappings.identityField] = "identity";
    }

    if (specialMappings.timestampField) {
      eventMapping[specialMappings.timestampField] = "ts";
    }

    // Process regular column mappings
    columnMappings.forEach((mapping) => {
      // Skip ignored fields and fields already used as special mappings
      if (
        mapping.type === "ignore" ||
        mapping.csv_name === specialMappings.identityField ||
        mapping.csv_name === specialMappings.timestampField
      ) {
        return;
      }

      if (mapping.type !== "item") {
        const targetField = "evtData." + mapping.clevertap_name;
        eventMapping[mapping.csv_name] = targetField;
      }
    });

    return eventMapping;
  };

  const getItemsFields = () => {
    const itemsFields = [];

    columnMappings.forEach((mapping) => {
      if (mapping.type === "item") {
        itemsFields.push({
          source: mapping.csv_name,
          target: mapping.clevertap_name,
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
        type: "string",
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
      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", accountId);
      formData.append("passcode", passcode);
      formData.append("apiUrl", apiUrl);
      formData.append("mapping", JSON.stringify(getEventMapping()));
      formData.append("itemsFields", JSON.stringify(getItemsFields()));
      formData.append("groupByField", specialMappings.groupByField);
      formData.append(
        "headers",
        JSON.stringify({
          "X-CleverTap-Account-Id": accountId,
          "X-CleverTap-Passcode": passcode,
          "Content-Type": "application/json",
        })
      );

      // Use the API service function
      await uploadEvents(formData);

      setSuccessMessage("Events uploaded successfully");
      setCurrentStep(3);
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error.message || "Error processing the file");
    } finally {
      setLoading(false);
    }
  };

  const PreviewModal = ({ data, onClose }) => {
    if (!data) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center overflow-y-auto">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Preview Charged Events</h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-600">
                Showing {data.previewEvents.length} events from your data. These
                events will be uploaded as "Charged" events to CleverTap.
              </p>
            </div>

            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
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
                  <span className="font-medium">Items array</span>: Contains all
                  products in this transaction
                </li>
              </ul>
            </div>

            <div className="space-y-6">
              {data.previewEvents.map((event, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 p-3 border-b border-gray-200">
                    <h3 className="font-medium">Charged Event #{index + 1}</h3>
                  </div>

                  <div className="p-0">
                    <div className="overflow-auto">
                      <div className="bg-gray-50 p-3 border-b border-gray-200 grid grid-cols-3 gap-2">
                        <div className="flex items-center">
                          <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 mr-2">
                            Identity
                          </span>
                          <span className="text-sm font-mono">
                            {event.identity}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 mr-2">
                            Timestamp
                          </span>
                          <span className="text-sm font-mono">{event.ts}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800 mr-2">
                            Event
                          </span>
                          <span className="text-sm font-mono">
                            {event.evtName}
                          </span>
                        </div>
                      </div>

                      <div className="p-3">
                        <h4 className="text-sm font-medium mb-2 text-gray-700">
                          Event Properties:
                        </h4>
                        <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-40 font-mono">
                          {JSON.stringify(event.evtData, null, 2)}
                        </pre>

                        {event.evtData?.Items &&
                          event.evtData.Items.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-medium mb-2 text-gray-700">
                                Items ({event.evtData.Items.length}):
                              </h4>
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      {Object.keys(event.evtData.Items[0]).map(
                                        (key) => (
                                          <th
                                            key={key}
                                            className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                          >
                                            {key}
                                          </th>
                                        )
                                      )}
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
                                                  value
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
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center"
              >
                <i className="fas fa-times mr-2"></i>
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

      <FileUploader
        accept=".csv"
        supportedFormats="CSV files"
        onFileSelect={handleFileChange}
        onError={handleFileError}
      />

      {selectedFileName && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <i className="fas fa-file-csv text-gray-500"></i>
            <span className="text-gray-700">{selectedFileName}</span>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleFirstStepSubmit}
          disabled={!file || loading}
          className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Continue"}
        </button>
      </div>
    </div>
  );

  const renderColumnMappingStep = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-black mb-6 flex items-center">
        <i className="fas fa-exchange-alt text-black mr-3"></i>Map Data
      </h2>
      <AlertMessage
        type="info"
        message="Map your CSV columns to CleverTap event properties. The event type will be 'Charged'. Configure special field mappings below."
      />
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
        <h3 className="text-lg font-medium text-gray-800 mb-3">
          Charged Event Structure
        </h3>
        <p className="text-sm text-gray-600">
          Your data will be uploaded as "Charged" events with the following
          structure:
        </p>
        <ul className="list-disc pl-5 mt-2 text-sm text-gray-600">
          <li>Identity field - Unique user identifier (email, phone, etc.)</li>
          <li>Timestamp field - When the transaction occurred</li>
          <li>
            Group By field - Field used to combine related items into one
            transaction
          </li>
          <li>Number fields - Will be added as properties under evtData</li>
          <li>
            Item fields - Will be grouped into the Items array based on the
            Group By field
          </li>
        </ul>
      </div>
      {/* Special mappings section */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-800 mb-3">
          Special Field Mappings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Identity Field <span className="text-red-500">*</span>
            </label>
            <select
              value={specialMappings.identityField}
              onChange={(e) =>
                handleSpecialMappingChange("identityField", e.target.value)
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select a field</option>
              {columns.map((column) => (
                <option key={`identity-${column}`} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Maps to CleverTap's identity field (Required)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timestamp Field <span className="text-red-500">*</span>
            </label>
            <select
              value={specialMappings.timestampField}
              onChange={(e) =>
                handleSpecialMappingChange("timestampField", e.target.value)
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select a field</option>
              {columns.map((column) => (
                <option key={`timestamp-${column}`} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Maps to CleverTap's timestamp (ts) field (Required)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group By Field <span className="text-red-500">*</span>
            </label>
            <select
              value={specialMappings.groupByField}
              onChange={(e) =>
                handleSpecialMappingChange("groupByField", e.target.value)
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select a field</option>
              {columns.map((column) => (
                <option key={`groupby-${column}`} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Used to group related items into one transaction (Required)
            </p>
          </div>
        </div>
      </div>

      {/* Column mapping section */}
      {columns.length > 0 && (
        <div className="space-y-6">
          {/* Event Data Properties Summary */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h4 className="font-medium text-gray-700 flex items-center">
                <i className="fas fa-chart-pie mr-2 text-purple-500"></i>
                Summary
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                Overview of your charged event data configuration
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Special Fields */}
                <div className="p-3 border rounded-lg bg-purple-50 border-purple-200">
                  <h5 className="text-sm font-medium text-purple-700 mb-2 flex items-center">
                    <i className="fas fa-key mr-1.5"></i> Special Fields
                  </h5>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">Identity Field:</span>
                      <span className="font-medium text-purple-800 bg-white px-2 py-0.5 rounded border border-purple-200">
                        {specialMappings.identityField || "Not set"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">Timestamp Field:</span>
                      <span className="font-medium text-purple-800 bg-white px-2 py-0.5 rounded border border-purple-200">
                        {specialMappings.timestampField || "Not set"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-gray-600">Group By Field:</span>
                      <span className="font-medium text-purple-800 bg-white px-2 py-0.5 rounded border border-purple-200">
                        {specialMappings.groupByField || "Not set"}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Event Data Properties */}
                <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
                  <h5 className="text-sm font-medium text-blue-700 mb-2 flex items-center">
                    <i className="fas fa-tag mr-1.5"></i> Event Data Properties
                  </h5>
                  <div className="flex flex-col justify-between h-full">
                    <div className="text-4xl font-bold text-blue-700 mb-2">
                      {
                        columnMappings.filter(
                          (mapping) =>
                            mapping.type !== "item" &&
                            mapping.type !== "ignore" &&
                            mapping.csv_name !==
                              specialMappings.identityField &&
                            mapping.csv_name !==
                              specialMappings.timestampField &&
                            mapping.csv_name !== specialMappings.groupByField
                        ).length
                      }
                    </div>
                    <div className="text-xs text-blue-600">
                      Properties will be added to the event data object
                    </div>
                  </div>
                </div>

                {/* Item Fields */}
                <div className="p-3 border rounded-lg bg-orange-50 border-orange-200">
                  <h5 className="text-sm font-medium text-orange-700 mb-2 flex items-center">
                    <i className="fas fa-shopping-cart mr-1.5"></i> Item Fields
                  </h5>
                  <div className="flex flex-col justify-between h-full">
                    <div className="text-4xl font-bold text-orange-700 mb-2">
                      {
                        columnMappings.filter(
                          (mapping) => mapping.type === "item"
                        ).length
                      }
                    </div>
                    <div className="text-xs text-orange-600">
                      Fields will be grouped into the Items array
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column Selection and Mapping Section */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                          className={
                            mapping.type === "ignore" ? "bg-gray-50" : ""
                          }
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {column}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex space-x-2">
                              <button
                                className={`px-2 py-1 text-xs rounded-full flex items-center ${
                                  mapping.type !== "item" &&
                                  mapping.type !== "ignore"
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-200 text-gray-600"
                                }`}
                                onClick={() => {
                                  const newMappings = [...columnMappings];
                                  const existingIndex = newMappings.findIndex(
                                    (m) => m.csv_name === column
                                  );

                                  if (existingIndex >= 0) {
                                    newMappings[existingIndex].type = "string";
                                  } else {
                                    newMappings.push({
                                      csv_name: column,
                                      clevertap_name: column,
                                      type: "string",
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

                              <button
                                className={`px-2 py-1 text-xs rounded-full flex items-center ${
                                  mapping.type === "item"
                                    ? "bg-orange-500 text-white"
                                    : "bg-gray-200 text-gray-600"
                                }`}
                                onClick={() => {
                                  const newMappings = [...columnMappings];
                                  const existingIndex = newMappings.findIndex(
                                    (m) => m.csv_name === column
                                  );

                                  if (existingIndex >= 0) {
                                    newMappings[existingIndex].type = "item";
                                  } else {
                                    newMappings.push({
                                      csv_name: column,
                                      clevertap_name: column,
                                      type: "item",
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

                              <button
                                className={`px-2 py-1 text-xs rounded-full flex items-center ${
                                  mapping.type === "ignore"
                                    ? "bg-gray-500 text-white"
                                    : "bg-gray-200 text-gray-600"
                                }`}
                                onClick={() => {
                                  const newMappings = [...columnMappings];
                                  const existingIndex = newMappings.findIndex(
                                    (m) => m.csv_name === column
                                  );

                                  if (existingIndex >= 0) {
                                    newMappings[existingIndex].type = "ignore";
                                  } else {
                                    newMappings.push({
                                      csv_name: column,
                                      clevertap_name: column,
                                      type: "ignore",
                                    });
                                  }

                                  setColumnMappings(newMappings);
                                }}
                              >
                                <i
                                  className={`fas fa-ban mr-1 ${
                                    mapping.type === "ignore"
                                      ? ""
                                      : "opacity-50"
                                  }`}
                                ></i>
                                Ignore
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="text"
                              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
                              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                mapping.type === "ignore" ? "bg-gray-100" : ""
                              }`}
                              value={mapping.dataType || "string"}
                              disabled={mapping.type === "ignore"}
                              onChange={(e) => {
                                const newMappings = [...columnMappings];
                                const existingIndex = newMappings.findIndex(
                                  (m) => m.csv_name === column
                                );

                                if (existingIndex >= 0) {
                                  if (mapping.type === "item") {
                                    newMappings[existingIndex].dataType =
                                      e.target.value;
                                  } else {
                                    newMappings[existingIndex].type =
                                      e.target.value;
                                  }
                                } else {
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
        </div>
      )}

      {/* Credentials section */}
      <div className="space-y-4 mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-800 mb-3">
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
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
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
          className="px-6 py-2 border border-black text-black rounded-lg hover:bg-gray-50 transition-colors disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed"
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
          className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
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
            // Reset all state at once
            setFile(null);
            setSelectedFileName("");
            setCurrentStep(1);
            setErrorMessage("");
            setSuccessMessage("");
            setAccountId("");
            setPasscode("");
            setApiUrl("https://api.clevertap.com/1/upload");
            setSpecialMappings({
              identityField: "",
              timestampField: "",
              groupByField: "",
            });
            // Reset columns and mappings to empty arrays
            setColumns([]);
            setColumnMappings([]);
          }}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Upload Another File
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  // ...existing code...

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

          {/* Show loading indicator if loading is true, otherwise show content */}
          {loading ? (
            <Loading />
          ) : (
            <>
              {/* Progress Steps */}
              <div className="mb-8">
                <div className="flex items-center justify-center space-x-4">
                  {[1, 2, 3].map((step) => (
                    <div key={step} className="flex items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          step === currentStep
                            ? "bg-black text-white"
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

              {/* Step Content */}
              {currentStep === 1 && renderFileUploadStep()}
              {currentStep === 2 && renderColumnMappingStep()}
              {currentStep === 3 && renderSuccessStep()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChargedEventUpload;
