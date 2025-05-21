import { useState, useEffect } from "react";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import Header from "./common/Header";
import Footer from "./common/Footer";
import Dropdown from "./common/Dropdown";

export default function CSVSplitter() {
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [dateColumn, setDateColumn] = useState("");
  const [dateFormat, setDateFormat] = useState("standard"); // "standard", "epoch", "epochms"
  const [customRanges, setCustomRanges] = useState([
    { start: "", end: "", name: "Range 1" },
  ]);

  const [accountName] = useState(localStorage.getItem("accountName"));
  const [clientEmail, setClientEmail] = useState(
    localStorage.getItem("email") || ""
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [splitResults, setSplitResults] = useState([]);
  const [preview, setPreview] = useState([]);
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  const [streamMode, setStreamMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [estimatedFileSize, setEstimatedFileSize] = useState(0);
  const [splitByMonth, setSplitByMonth] = useState(false);
  const [monthRange, setMonthRange] = useState({ start: "", end: "" });
  const [previewDates, setPreviewDates] = useState([]);

  // Toggle upload help section
  const toggleUploadHelp = () => {
    setShowUploadHelp(!showUploadHelp);
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);

      // Check if file is large (over 100MB)
      const isLargeFile = uploadedFile.size > 100 * 1024 * 1024;
      setStreamMode(isLargeFile);
      setEstimatedFileSize(uploadedFile.size);

      // Reset any previous state
      setError("");
      setHeaders([]);
      setParsedData([]);
      setPreview([]);
      setPreviewDates([]);
      setSplitResults([]);
      setProgress(0);
      setTotalRows(0);
      setProcessedRows(0);

      // Try to parse the CSV
      parseCSV(uploadedFile, isLargeFile);
    }
  };

  // Parse CSV function
  const parseCSV = (file, isLargeFile) => {
    setIsProcessing(true);
    setError("");

    try {
      if (isLargeFile) {
        // For large files, we only parse headers and sample rows first
        const chunkSize = 5; // Just get first few rows for preview
        let rowCount = 0;
        let headersParsed = false;
        let sampleRows = [];

        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          delimitersToGuess: [",", "\t", "|", ";"],
          chunk: (results, parser) => {
            if (!headersParsed) {
              // Process headers from the first chunk
              const cleanHeaders = results.meta.fields.map((header) =>
                header.trim()
              );
              setHeaders(cleanHeaders);
              headersParsed = true;

              // Try to automatically detect date column
              const possibleDateColumns = cleanHeaders.filter(
                (header) =>
                  header.toLowerCase().includes("date") ||
                  header.toLowerCase().includes("time") ||
                  header.toLowerCase().includes("epoch")
              );

              if (possibleDateColumns.length > 0) {
                setDateColumn(possibleDateColumns[0]);
              }
            }

            // Collect sample rows for preview
            if (sampleRows.length < 5) {
              const newRows = results.data.slice(0, 5 - sampleRows.length);
              sampleRows = [...sampleRows, ...newRows];
              setPreview(sampleRows);

              // Try to detect epoch format
              detectDateFormat(sampleRows);
            }

            // Count rows to estimate total
            rowCount += results.data.length;
            setTotalRows((prevCount) => prevCount + results.data.length);

            // For very large files, we stop parsing here and will process on demand
            if (rowCount > chunkSize) {
              parser.abort();
              setIsProcessing(false);
            }
          },
          complete: () => {
            setIsProcessing(false);
          },
          error: (error) => {
            console.error("CSV parsing error:", error);
            setError(
              `Error parsing CSV: ${error.message}. This might be due to file access restrictions or file size.`
            );
            setIsProcessing(false);
          },
        });
      } else {
        // Regular parsing for smaller files
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          delimitersToGuess: [",", "\t", "|", ";"],
          complete: (results) => {
            if (results.data && results.data.length > 0) {
              // Get headers with whitespace trimmed
              const cleanHeaders = results.meta.fields.map((header) =>
                header.trim()
              );
              setHeaders(cleanHeaders);
              setParsedData(results.data);
              setPreview(results.data.slice(0, 5));
              setTotalRows(results.data.length);

              // Try to detect date format
              detectDateFormat(results.data.slice(0, 5));

              // Try to automatically detect date column
              const possibleDateColumns = cleanHeaders.filter(
                (header) =>
                  header.toLowerCase().includes("date") ||
                  header.toLowerCase().includes("time") ||
                  header.toLowerCase().includes("epoch")
              );

              if (possibleDateColumns.length > 0) {
                setDateColumn(possibleDateColumns[0]);
              }
            } else {
              setError("The CSV file appears to be empty or invalid.");
            }
            setIsProcessing(false);
          },
          error: (error) => {
            console.error("CSV parsing error:", error);
            setError(
              `Error parsing CSV: ${error.message}. This might be due to file access restrictions in your browser.`
            );
            setIsProcessing(false);
          },
        });
      }
    } catch (e) {
      console.error("Exception during CSV parsing:", e);
      setError(
        `Failed to process the file: ${e.message}. Please try downloading the file to your computer first and then uploading it.`
      );
      setIsProcessing(false);
    }
  };

  // Enhance the detectDateFormat function
  const detectDateFormat = (sampleData) => {
    if (!sampleData || sampleData.length === 0 || !dateColumn) return;

    const previewValues = [];

    // Check if dateColumn exists in sample data
    const hasColumn = sampleData.some((row) => dateColumn in row);
    if (!hasColumn) {
      console.warn(`Selected date column "${dateColumn}" not found in data`);
      return;
    }

    // Get sample values for date detection
    for (const row of sampleData) {
      if (row[dateColumn] !== undefined && row[dateColumn] !== null) {
        const value = row[dateColumn];

        // Check if it's a number (potential epoch)
        if (
          typeof value === "number" ||
          (typeof value === "string" && !isNaN(value))
        ) {
          const numValue = Number(value);

          // Check if epoch seconds (10 digits) or epoch milliseconds (13 digits)
          if (numValue > 1000000000 && numValue < 10000000000) {
            // Epoch seconds
            setDateFormat("epoch");
            const date = new Date(numValue * 1000);
            previewValues.push({
              original: value,
              converted: date.toISOString(),
              valid: !isNaN(date.getTime()),
              format: "epoch",
              valueType: typeof value,
            });
          } else if (numValue > 1000000000000 && numValue < 10000000000000) {
            // Epoch milliseconds
            setDateFormat("epochms");
            const date = new Date(numValue);
            previewValues.push({
              original: value,
              converted: date.toISOString(),
              valid: !isNaN(date.getTime()),
              format: "epochms",
              valueType: typeof value,
            });
          } else {
            // Not a recognized epoch format - try standard
            setDateFormat("standard");
            const date = new Date(value);
            previewValues.push({
              original: value,
              converted: date.toISOString(),
              valid: !isNaN(date.getTime()),
              format: "standard",
              valueType: typeof value,
            });
          }
        } else {
          // Try to parse as normal date
          setDateFormat("standard");
          const date = new Date(value);
          previewValues.push({
            original: value,
            converted: date.toISOString(),
            valid: !isNaN(date.getTime()),
            format: "standard",
            valueType: typeof value,
          });
        }

        if (previewValues.length >= 5) break; // We only need a few samples
      }
    }

    console.log("Date format detection results:", previewValues);
    setPreviewDates(previewValues);
  };

  // Modify the convertToDate function to be more robust
  const convertToDate = (value) => {
    if (!value) return null;

    try {
      // Handle different formats
      if (dateFormat === "epoch") {
        // Epoch seconds - ensure it's a number
        const numVal = typeof value === "number" ? value : Number(value);
        if (isNaN(numVal)) return null;
        return new Date(numVal * 1000);
      } else if (dateFormat === "epochms") {
        // Epoch milliseconds - ensure it's a number
        const numVal = typeof value === "number" ? value : Number(value);
        if (isNaN(numVal)) return null;
        return new Date(numVal);
      } else {
        // Standard date format - handle various string formats
        const date = new Date(value);
        // Check if date is valid
        if (isNaN(date.getTime())) return null;
        return date;
      }
    } catch (e) {
      console.error(`Error converting date value "${value}":`, e);
      return null;
    }
  };

  // Add a new date range
  const addRange = () => {
    setCustomRanges([
      ...customRanges,
      { start: "", end: "", name: `Range ${customRanges.length + 1}` },
    ]);
  };

  // Update a specific range
  const updateRange = (index, field, value) => {
    const updatedRanges = [...customRanges];
    updatedRanges[index] = { ...updatedRanges[index], [field]: value };
    setCustomRanges(updatedRanges);
  };

  // Remove a range
  const removeRange = (index) => {
    if (customRanges.length > 1) {
      const updatedRanges = customRanges.filter((_, i) => i !== index);
      setCustomRanges(updatedRanges);
    }
  };

  // Generate monthly ranges
  const generateMonthlyRanges = () => {
    if (!monthRange.start || !monthRange.end) {
      setError("Please specify start and end months");
      return;
    }

    try {
      const startDate = new Date(monthRange.start + "-01");
      const endDate = new Date(monthRange.end + "-01");

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        setError("Invalid month format");
        return;
      }

      if (startDate > endDate) {
        setError("Start month must be before end month");
        return;
      }

      const newRanges = [];
      let currentDate = new Date(startDate);
      let rangeIndex = 1;

      while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0); // Last day of current month

        const monthName = firstDay.toLocaleString("default", { month: "long" });

        newRanges.push({
          start: firstDay.toISOString().split("T")[0],
          end: lastDay.toISOString().split("T")[0],
          name: `${monthName} ${year}`,
        });

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
        rangeIndex++;
      }

      setCustomRanges(newRanges);
    } catch (err) {
      setError(`Error generating monthly ranges: ${err.message}`);
    }
  };

  // Process and split the CSV
  const splitCSV = () => {
    if (!dateColumn) {
      setError("Please select a date column");
      return;
    }

    if (customRanges.some((range) => !range.start || !range.end)) {
      setError("All date ranges must have start and end dates");
      return;
    }

    setIsProcessing(true);
    setError("");
    setSplitResults([]);
    setProgress(0);
    setProcessedRows(0);

    try {
      // Initialize results structure for each range
      const results = customRanges.map((range) => ({
        name: range.name,
        startDate: range.start,
        endDate: range.end,
        count: 0,
        chunks: [],
        startDateObj: new Date(range.start),
        endDateObj: new Date(range.end),
      }));

      // Validate dates
      const invalidRanges = results.filter(
        (r) => isNaN(r.startDateObj.getTime()) || isNaN(r.endDateObj.getTime())
      );

      if (invalidRanges.length > 0) {
        throw new Error(
          `Invalid date format in range: ${invalidRanges[0].name}`
        );
      }

      if (streamMode) {
        processLargeFileInChunks(results);
      } else {
        // Process normally for smaller files
        processSmallFile(results);
      }
    } catch (err) {
      setError(`Error splitting CSV: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // Add this function for debugging
  const debugRow = (row, rowDate, ranges) => {
    console.log("Processing row:", {
      dateColumn,
      dateValue: row[dateColumn],
      convertedDate: rowDate ? rowDate.toISOString() : "Invalid date",
      dateFormat,
      ranges: ranges.map((r) => ({
        name: r.name,
        startDate: r.startDateObj.toISOString(),
        endDate: r.endDateObj.toISOString(),
        matches: rowDate >= r.startDateObj && rowDate <= r.endDateObj,
      })),
    });
  };

  // Modify the processSmallFile function to include debugging
  const processSmallFile = (results) => {
    try {
      // Add debugging counters
      const stats = {
        total: parsedData.length,
        missingDateColumn: 0,
        invalidDates: 0,
        matched: 0,
      };

      // Debug the first few rows
      const debugLimit = 5;
      let debugCount = 0;

      customRanges.forEach((range, rangeIndex) => {
        // Filter data for this range
        const filteredData = parsedData.filter((row) => {
          if (!row[dateColumn]) {
            stats.missingDateColumn++;
            return false;
          }

          const rowDate = convertToDate(row[dateColumn]);

          // Debug a few rows
          if (debugCount < debugLimit) {
            debugRow(row, rowDate, [
              {
                name: range.name,
                startDateObj: results[rangeIndex].startDateObj,
                endDateObj: results[rangeIndex].endDateObj,
              },
            ]);
            debugCount++;
          }

          if (!rowDate || isNaN(rowDate.getTime())) {
            stats.invalidDates++;
            return false;
          }

          const isInRange =
            rowDate >= results[rangeIndex].startDateObj &&
            rowDate <= results[rangeIndex].endDateObj;

          if (isInRange) stats.matched++;
          return isInRange;
        });

        // Update results
        if (filteredData.length > 0) {
          const csv = Papa.unparse(filteredData);
          results[rangeIndex] = {
            ...results[rangeIndex],
            count: filteredData.length,
            csv: csv,
          };
        }
      });

      // Log statistics
      console.log("Processing stats:", stats);

      setSplitResults(results);
      setIsProcessing(false);
    } catch (err) {
      console.error("Error details:", err);
      setError(`Error processing CSV: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // Modify the processLargeFileInChunks function to fix date handling
  const processLargeFileInChunks = (results) => {
    let processedCount = 0;
    let skippedCount = 0;
    let matchedCount = 0;

    // Debug the first few rows
    let debugCount = 0;
    const debugLimit = 5;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      chunk: (chunkResult) => {
        // Process this chunk of data
        processedCount += chunkResult.data.length;
        setProcessedRows(processedCount);

        // Set progress percentage
        const estimatedTotal = Math.max(totalRows, file.size / 100);
        const progressPercent = Math.min(
          Math.round((processedCount / estimatedTotal) * 100),
          99
        );
        setProgress(progressPercent);

        // Filter rows into appropriate ranges
        chunkResult.data.forEach((row) => {
          if (!row[dateColumn]) {
            skippedCount++;
            return;
          }

          const rowDate = convertToDate(row[dateColumn]);

          // Debug a sample of rows
          if (debugCount < debugLimit) {
            debugRow(row, rowDate, results);
            debugCount++;
          }

          if (!rowDate || isNaN(rowDate.getTime())) {
            skippedCount++;
            return;
          }

          // Check which range(s) this row belongs to
          let matched = false;
          results.forEach((range, rangeIndex) => {
            if (rowDate >= range.startDateObj && rowDate <= range.endDateObj) {
              results[rangeIndex].count += 1;
              matched = true;

              // Create CSV fragment with header for the first row
              const isFirstRow = results[rangeIndex].count === 1;
              const rowData = Papa.unparse(
                {
                  fields: Object.keys(row),
                  data: [Object.values(row)],
                },
                {
                  header: isFirstRow, // Only include header for first row
                }
              );

              if (!results[rangeIndex].chunks) {
                results[rangeIndex].chunks = [];
              }

              results[rangeIndex].chunks.push(rowData);
            }
          });

          if (matched) matchedCount++;
        });
      },
      complete: () => {
        // Log statistics
        console.log("Processing complete:", {
          processedRows: processedCount,
          skippedRows: skippedCount,
          matchedRows: matchedCount,
        });

        // Finalize results
        const finalResults = results.map((range) => {
          // Combine chunks if we have any
          let csv = null;
          if (range.chunks && range.chunks.length > 0) {
            csv = range.chunks.join("\n");
          }

          return {
            name: range.name,
            startDate: range.startDate,
            endDate: range.endDate,
            count: range.count,
            csv: csv,
          };
        });

        setSplitResults(finalResults);
        setProgress(100);
        setIsProcessing(false);
      },
      error: (error) => {
        console.error("CSV parsing error:", error);
        setError(`Error processing CSV: ${error.message}`);
        setIsProcessing(false);
      },
    });
  };

  // Download a specific range as CSV
  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
    else return (bytes / 1073741824).toFixed(2) + " GB";
  };

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

  return (
    <div className="min-h-screen text-gray-700 flex flex-col">
      <Header rightContent={headerRightContent} />
      <div className="p-4 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">CSV Date Range Splitter</h1>

        {/* File Upload Section */}
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <h2 className="text-lg font-semibold mb-3">
            Step 1: Upload CSV File
          </h2>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm border rounded p-2"
          />

          {file && (
            <div className="mt-2 text-sm">
              <p>
                <strong>File:</strong> {file.name}
              </p>
              <p>
                <strong>Size:</strong> {formatFileSize(file.size)}
              </p>
              <p>
                <strong>Processing mode:</strong>{" "}
                {streamMode ? "Streaming (large file)" : "Standard"}
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="mt-2">
              <p className="text-blue-600">Processing file...</p>
              {streamMode && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm mt-1">
                    {processedRows.toLocaleString()} rows processed
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 text-sm text-gray-600">
            <p>
              Supported file formats: CSV files with comma, tab, pipe, or
              semicolon delimiters
            </p>
            <p className="mt-1 text-amber-700 font-medium">
              For large files (7-10GB), processing may take several minutes and
              require sufficient browser memory
            </p>
            <button
              onClick={toggleUploadHelp}
              className="text-blue-600 hover:text-blue-800 font-medium mt-1 focus:outline-none"
            >
              {showUploadHelp
                ? "Hide troubleshooting tips"
                : "Show troubleshooting tips for file upload errors"}
            </button>

            {showUploadHelp && (
              <div className="mt-2 p-3 bg-blue-50 rounded">
                <p className="font-medium">
                  Common Solutions for File Upload Issues:
                </p>
                <ul className="list-disc pl-5 mt-1">
                  <li>
                    Download the CSV file to your local computer before
                    uploading
                  </li>
                  <li>
                    Make sure the file isn't currently open in another program
                  </li>
                  <li>Try saving the file with a different name</li>
                  <li>Use a modern browser like Chrome, Firefox, or Edge</li>
                  <li>Check if your CSV file is properly formatted</li>
                  <li>
                    For large files (7-10GB), consider:
                    <ul className="list-circle pl-5 mt-1">
                      <li>
                        Splitting the file before upload using external tools
                      </li>
                      <li>Using a 64-bit browser with sufficient memory</li>
                      <li>Closing other browser tabs and applications</li>
                      <li>Using Chrome or Edge for best large file handling</li>
                    </ul>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded text-red-900">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>

            {error.includes("file could not be read") && (
              <div className="mt-2">
                <p className="font-medium">Troubleshooting steps:</p>
                <ol className="list-decimal pl-5 mt-1">
                  <li>Make sure you're uploading a valid CSV file</li>
                  <li>Download the file to your computer before uploading</li>
                  <li>Try using a different browser</li>
                  <li>
                    Check if the file is locked or in use by another application
                  </li>
                  <li>
                    Try a smaller CSV file first to verify the application works
                  </li>
                  <li>
                    For very large files (2GB), consider pre-splitting the file
                    using command-line tools
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {headers.length > 0 && (
          <>
            {/* Data Preview */}
            <div className="mb-6 p-4 border rounded bg-gray-50">
              <h2 className="text-lg font-semibold mb-3">CSV Preview</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                  <thead>
                    <tr>
                      {headers.map((header, index) => (
                        <th key={index} className="border p-2 bg-gray-100">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {headers.map((header, colIndex) => (
                          <td key={colIndex} className="border p-2">
                            {row[header]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Showing 5 {streamMode ? "" : `of ${parsedData.length}`} rows
                {streamMode && (
                  <span className="font-medium text-amber-700">
                    {" "}
                    (Large file mode: Full data is not loaded in memory)
                  </span>
                )}
              </p>
            </div>

            {/* Date Column Selection */}
            <div className="mb-6 p-4 border rounded bg-gray-50">
              <h2 className="text-lg font-semibold mb-3">
                Step 2: Select Date Column
              </h2>
              <div className="mb-4">
                <select
                  value={dateColumn}
                  onChange={(e) => setDateColumn(e.target.value)}
                  className="block w-full p-2 border rounded"
                >
                  <option value="">Select a column...</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-gray-600">
                  Select the column that contains date values
                </p>
              </div>

              {dateColumn && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-medium mb-2">Date Format</h3>
                  <div className="flex items-center space-x-4">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        value="standard"
                        checked={dateFormat === "standard"}
                        onChange={() => setDateFormat("standard")}
                        className="mr-2"
                      />
                      Standard Date
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        value="epoch"
                        checked={dateFormat === "epoch"}
                        onChange={() => setDateFormat("epoch")}
                        className="mr-2"
                      />
                      Epoch Seconds
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        value="epochms"
                        checked={dateFormat === "epochms"}
                        onChange={() => setDateFormat("epochms")}
                        className="mr-2"
                      />
                      Epoch Milliseconds
                    </label>
                  </div>

                  {previewDates.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-100 rounded">
                      <p className="font-medium text-sm mb-2">
                        Date Format Preview:
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-2">Original Value</th>
                            <th className="text-left px-2">Type</th>
                            <th className="text-left px-2">Format</th>
                            <th className="text-left px-2">Converted Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewDates.map((date, idx) => (
                            <tr
                              key={idx}
                              className={!date.valid ? "text-red-600" : ""}
                            >
                              <td className="px-2">{String(date.original)}</td>
                              <td className="px-2">{date.valueType}</td>
                              <td className="px-2">{date.format}</td>
                              <td className="px-2">
                                {date.valid ? date.converted : "Invalid date"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs text-gray-600">
                        {dateFormat === "epoch" &&
                          "Converting timestamps as epoch seconds (multiply by 1000)"}
                        {dateFormat === "epochms" &&
                          "Converting timestamps as epoch milliseconds (direct)"}
                        {dateFormat === "standard" &&
                          "Converting dates using standard JavaScript Date parsing"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Date Range Configuration */}
            <div className="mb-6 p-4 border rounded bg-gray-50">
              <h2 className="text-lg font-semibold mb-3">
                Step 3: Configure Date Ranges
              </h2>

              {/* Split by Months option */}
              <div className="mb-4 p-3 border rounded bg-white">
                <h3 className="font-medium mb-2">Split Options</h3>

                <div className="mb-3">
                  <label className="inline-flex items-center mb-2">
                    <input
                      type="checkbox"
                      checked={splitByMonth}
                      onChange={(e) => setSplitByMonth(e.target.checked)}
                      className="mr-2"
                    />
                    Generate monthly ranges
                  </label>

                  {splitByMonth && (
                    <div className="mt-2 p-3 bg-gray-50 rounded">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Start Month (YYYY-MM):
                          </label>
                          <input
                            type="month"
                            value={monthRange.start}
                            onChange={(e) =>
                              setMonthRange({
                                ...monthRange,
                                start: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded"
                            placeholder="YYYY-MM"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            End Month (YYYY-MM):
                          </label>
                          <input
                            type="month"
                            value={monthRange.end}
                            onChange={(e) =>
                              setMonthRange({
                                ...monthRange,
                                end: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded"
                            placeholder="YYYY-MM"
                          />
                        </div>
                      </div>
                      <button
                        onClick={generateMonthlyRanges}
                        className="mt-3 bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600"
                      >
                        Generate Monthly Ranges
                      </button>
                      <p className="mt-2 text-xs text-gray-500">
                        This will create date ranges for each month in the
                        selected period
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom ranges */}
              {!splitByMonth && (
                <p className="mb-3 font-medium">Custom Date Ranges:</p>
              )}
              {customRanges.map((range, index) => (
                <div key={index} className="mb-4 p-3 border rounded bg-white">
                  <div className="flex items-center mb-2">
                    <input
                      type="text"
                      value={range.name}
                      onChange={(e) =>
                        updateRange(index, "name", e.target.value)
                      }
                      className="flex-grow p-2 border rounded mr-2"
                      placeholder="Range name"
                    />
                    {customRanges.length > 1 && (
                      <button
                        onClick={() => removeRange(index)}
                        className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Start Date:
                      </label>
                      <input
                        type="date"
                        value={range.start}
                        onChange={(e) =>
                          updateRange(index, "start", e.target.value)
                        }
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        End Date:
                      </label>
                      <input
                        type="date"
                        value={range.end}
                        onChange={(e) =>
                          updateRange(index, "end", e.target.value)
                        }
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {!splitByMonth && (
                <button
                  onClick={addRange}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mr-2"
                >
                  Add Another Range
                </button>
              )}
            </div>

            {/* Split Button */}
            <div className="mb-6">
              <button
                onClick={splitCSV}
                disabled={isProcessing}
                className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {isProcessing ? "Processing..." : "Split CSV by Date Ranges"}
              </button>

              {isProcessing && streamMode && (
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-green-600 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-1 text-sm">
                    <span>{processedRows.toLocaleString()} rows processed</span>
                    <span>{progress}%</span>
                  </div>
                </div>
              )}

              {streamMode && (
                <p className="mt-2 text-sm text-amber-700">
                  <strong>Note:</strong> Processing large files can take several
                  minutes. Please be patient and keep this tab active.
                </p>
              )}
            </div>
          </>
        )}

        {/* Results Section */}
        {splitResults.length > 0 && (
          <div className="p-4 border rounded bg-gray-50">
            <h2 className="text-lg font-semibold mb-3">Split Results</h2>
            <div className="grid grid-cols-1 gap-4">
              {splitResults.map((result, index) => (
                <div key={index} className="p-3 border rounded bg-white">
                  <h3 className="font-medium">{result.name}</h3>
                  <p className="text-sm text-gray-600">
                    From {result.startDate} to {result.endDate}
                  </p>
                  <p className="mt-1">Records: {result.count}</p>
                  {result.count > 0 ? (
                    <button
                      onClick={() =>
                        downloadCSV(
                          result.csv,
                          `${result.name.replace(/\s+/g, "_")}`
                        )
                      }
                      className="mt-2 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                    >
                      Download CSV
                    </button>
                  ) : (
                    <p className="mt-2 text-orange-500">
                      No data in this range
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
