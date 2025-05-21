import { useState, useEffect } from "react";
import * as Papa from "papaparse";

export default function CleverTapUploader() {
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({
    identity: "",
    timestamp: "",
    groupColumn: "",
    eventName: "",
    eventColumns: [],
    itemColumns: [],
    itemIdColumn: "",
  });
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setLoading(true);

      Papa.parse(uploadedFile, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          setFileData(results.data);
          setHeaders(results.meta.fields || []);
          setLoading(false);
          setStep(2);
        },
        error: (error) => {
          console.error("Error parsing CSV:", error);
          setLoading(false);
        },
      });
    }
  };

  const handleMappingChange = (field, value) => {
    setMapping((prev) => ({ ...prev, [field]: value }));
  };

  const toggleEventColumn = (header) => {
    setMapping((prev) => {
      const isSelected = prev.eventColumns.includes(header);
      const updatedColumns = isSelected
        ? prev.eventColumns.filter((col) => col !== header)
        : [...prev.eventColumns, header];

      return { ...prev, eventColumns: updatedColumns };
    });
  };

  const toggleItemColumn = (header) => {
    setMapping((prev) => {
      const isSelected = prev.itemColumns.includes(header);
      const updatedColumns = isSelected
        ? prev.itemColumns.filter((col) => col !== header)
        : [...prev.itemColumns, header];

      return { ...prev, itemColumns: updatedColumns };
    });
  };

  const processData = () => {
    if (fileData.length === 0) return;

    // Group by identity, timestamp, and the selected group column
    const groupedData = {};

    fileData.forEach((row) => {
      const identity = row[mapping.identity];
      const timestamp = row[mapping.timestamp];
      const groupValue = mapping.groupColumn ? row[mapping.groupColumn] : "";

      // Skip if missing required keys
      if (!identity || !timestamp) return;

      const key = `${identity}_${timestamp}_${groupValue}`;

      if (!groupedData[key]) {
        groupedData[key] = {
          identity,
          timestamp,
          items: [],
        };
      }

      // Extract event data
      const eventData = {};
      mapping.eventColumns.forEach((col) => {
        if (row[col] !== undefined) {
          eventData[col] = row[col];
        }
      });

      // Extract item data
      const itemData = {};
      mapping.itemColumns.forEach((col) => {
        if (row[col] !== undefined) {
          itemData[col] = row[col];
        }
      });

      // Add item to the group's items array
      if (
        Object.keys(itemData).length > 0 &&
        mapping.itemIdColumn &&
        row[mapping.itemIdColumn]
      ) {
        itemData.ITEMID = row[mapping.itemIdColumn];
        groupedData[key].items.push(itemData);
      }

      // Merge event data with existing data
      groupedData[key] = {
        ...groupedData[key],
        evtName: mapping.eventName || "Charged",
        evtData: {
          ...groupedData[key].evtData,
          ...eventData,
        },
      };
    });

    // Format according to CleverTap's requirement
    const payload = {
      d: Object.values(groupedData).map((group) => ({
        identity: group.identity,
        ts: group.timestamp,
        type: "event",
        evtName: group.evtName,
        evtData: {
          ...group.evtData,
          Items: group.items,
        },
      })),
    };

    setPreview(JSON.stringify(payload, null, 2));
    setStep(4);
  };

  const isReadyToProcess = () => {
    return (
      mapping.identity &&
      mapping.timestamp &&
      mapping.eventName &&
      mapping.eventColumns.length > 0 &&
      mapping.itemColumns.length > 0 &&
      mapping.itemIdColumn
    );
  };

  const downloadJSON = () => {
    if (!preview) return;

    const blob = new Blob([preview], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clevertap_payload.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderStepOne = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Step 1: Upload CSV File</h2>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Select CSV file:</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="w-full p-2 border border-gray-300 rounded"
        />
      </div>
      {loading && <div className="text-blue-500">Loading file data...</div>}
    </div>
  );

  const renderStepTwo = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">
        Step 2: Configure Required Fields
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-gray-700 mb-2">Identity Column:</label>
          <select
            value={mapping.identity}
            onChange={(e) => handleMappingChange("identity", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          >
            <option value="">Select Column</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-gray-700 mb-2">Timestamp Column:</label>
          <select
            value={mapping.timestamp}
            onChange={(e) => handleMappingChange("timestamp", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          >
            <option value="">Select Column</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-gray-700 mb-2">
            Additional Grouping Column (Optional):
          </label>
          <select
            value={mapping.groupColumn}
            onChange={(e) => handleMappingChange("groupColumn", e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          >
            <option value="">None</option>
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-gray-700 mb-2">Event Name:</label>
          <input
            type="text"
            value={mapping.eventName}
            onChange={(e) => handleMappingChange("eventName", e.target.value)}
            placeholder="Charged"
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep(1)}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          disabled={
            !mapping.identity || !mapping.timestamp || !mapping.eventName
          }
        >
          Next
        </button>
      </div>
    </div>
  );

  const renderStepThree = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Step 3: Select Data Columns</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-bold mb-2">Event Data Columns:</h3>
          <div className="max-h-64 overflow-y-auto border border-gray-200 p-3 rounded">
            {headers.map((header) => (
              <div key={`event-${header}`} className="mb-1">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mapping.eventColumns.includes(header)}
                    onChange={() => toggleEventColumn(header)}
                    className="mr-2"
                  />
                  {header}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-bold mb-2">Item Data Columns:</h3>
          <div className="max-h-64 overflow-y-auto border border-gray-200 p-3 rounded">
            {headers.map((header) => (
              <div key={`item-${header}`} className="mb-1">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mapping.itemColumns.includes(header)}
                    onChange={() => toggleItemColumn(header)}
                    className="mr-2"
                  />
                  {header}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-gray-700 mb-2">Item ID Column:</label>
        <select
          value={mapping.itemIdColumn}
          onChange={(e) => handleMappingChange("itemIdColumn", e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
        >
          <option value="">Select Column</option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStep(2)}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          Back
        </button>
        <button
          onClick={processData}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          disabled={!isReadyToProcess()}
        >
          Process Data
        </button>
      </div>
    </div>
  );

  const renderStepFour = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Step 4: Output Preview</h2>

      <div className="mb-4">
        <h3 className="font-bold mb-2">JSON Payload Preview:</h3>
        <pre className="bg-gray-100 p-4 rounded max-h-96 overflow-y-auto text-sm whitespace-pre-wrap">
          {preview}
        </pre>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setStep(3)}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          Back
        </button>
        <button
          onClick={downloadJSON}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Download JSON
        </button>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-center">
        CleverTap Event Uploader
      </h1>

      <div className="mb-6">
        <div className="flex items-center justify-center">
          {[1, 2, 3, 4].map((stepNum) => (
            <div key={stepNum} className="flex items-center">
              <div
                className={`rounded-full h-10 w-10 flex items-center justify-center ${
                  stepNum === step
                    ? "bg-blue-600 text-white"
                    : stepNum < step
                    ? "bg-green-500 text-white"
                    : "bg-gray-300"
                }`}
              >
                {stepNum}
              </div>
              {stepNum < 4 && (
                <div
                  className={`h-1 w-10 ${
                    stepNum < step ? "bg-green-500" : "bg-gray-300"
                  }`}
                ></div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-sm text-gray-600">
          <span className="w-16 text-center">Upload</span>
          <span className="w-16 text-center">Config</span>
          <span className="w-16 text-center">Columns</span>
          <span className="w-16 text-center">Output</span>
        </div>
      </div>

      {step === 1 && renderStepOne()}
      {step === 2 && renderStepTwo()}
      {step === 3 && renderStepThree()}
      {step === 4 && renderStepFour()}
    </div>
  );
}
