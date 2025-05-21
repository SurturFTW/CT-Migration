import { useState } from "react";
import Papa from "papaparse";

export default function PhoneNumberProcessor() {
  const [file, setFile] = useState(null);
  const [columnName, setColumnName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [preview, setPreview] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");

  const handleFileUpload = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus("File selected");

      // Parse headers to get column names
      Papa.parse(selectedFile, {
        header: true,
        preview: 1,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0) {
            const columnHeaders = Object.keys(results.data[0]);
            setHeaders(columnHeaders);

            // Create a preview of the data
            Papa.parse(selectedFile, {
              header: true,
              preview: 5,
              skipEmptyLines: true,
              complete: (previewResults) => {
                setPreview(previewResults.data);
              },
            });
          }
        },
      });
    }
  };

  const processFile = () => {
    if (!file || !columnName) {
      setStatus("Please select a file and specify a column name");
      return;
    }

    setIsProcessing(true);
    setStatus("Processing...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const processedRows = results.data.map((row) => {
          // Create a new object with all the original properties
          const newRow = { ...row };

          // Check if the column exists in this row
          if (columnName in newRow) {
            let phoneNumber = newRow[columnName];

            // Check if the phone number is defined and is a string
            if (phoneNumber && typeof phoneNumber === "string") {
              // Trim whitespace
              phoneNumber = phoneNumber.trim();

              // Check if it already starts with +91
              if (!phoneNumber.startsWith("+91")) {
                // Remove any leading zeros
                while (phoneNumber.startsWith("0")) {
                  phoneNumber = phoneNumber.substring(1);
                }

                // Add +91 prefix
                newRow[columnName] = "+91" + phoneNumber;
              }
            }
          }

          return newRow;
        });

        setProcessedData({
          data: processedRows,
          meta: results.meta,
        });

        setIsProcessing(false);
        setStatus("Processing complete");
      },
      error: (error) => {
        setIsProcessing(false);
        setStatus(`Error: ${error.message}`);
      },
    });
  };

  const downloadProcessedFile = () => {
    if (!processedData) return;

    const csv = Papa.unparse(processedData.data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `processed_${file.name}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto bg-gray-50 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-4 text-blue-700">
        Phone Number Processor
      </h1>
      <p className="mb-4 text-gray-700">
        Add +91 prefix to phone numbers in a CSV file if they don't already have
        it.
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Upload CSV File
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
        />
      </div>

      {headers.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Phone Number Column
          </label>
          <select
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 
                      focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="">-- Select Column --</option>
            {headers.map((header, index) => (
              <option key={index} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
      )}

      {preview.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Data Preview:</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  {headers.map((header, index) => (
                    <th
                      key={index}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header}
                      {header === columnName && " ✓"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {preview.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {headers.map((header, colIndex) => (
                      <td
                        key={colIndex}
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                      >
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col space-y-4 mt-6">
        <button
          onClick={processFile}
          disabled={!file || !columnName || isProcessing}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                    disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isProcessing ? "Processing..." : "Process File"}
        </button>

        {processedData && (
          <button
            onClick={downloadProcessedFile}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 
                      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Download Processed File
          </button>
        )}
      </div>

      {status && (
        <div className="mt-4 p-3 rounded-md bg-blue-50 text-blue-700">
          {status}
        </div>
      )}
    </div>
  );
}
