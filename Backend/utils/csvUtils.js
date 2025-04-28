// Enhanced function to fix all CSV special characters
const fixCsvSpecialChars = (value) => {
  if (typeof value !== "string") return value;

  // Check if it's a valid JSON string
  try {
    JSON.parse(value);
    // If it's valid JSON, return it as is
    return value;
  } catch (e) {
    // Not JSON, continue with normal processing
  }

  // Determine if the field needs quoting
  let needsQuoting = ["\n", "\r", '"', "\\", "|", ";"].some((char) =>
    value.includes(char)
  );

  // Check for commas - special case
  const hasCommas = value.includes(",");
  const isPatternedList =
    hasCommas &&
    (/^(\w+)(,\1)+$/.test(value) ||
      value.split(",").every((part) => part.trim().length > 0));

  // Don't quote patterned lists with commas
  if (hasCommas && isPatternedList) {
    needsQuoting = false;
  }

  // Remove any control characters
  const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  let cleanValue = value.replace(controlCharRegex, "");

  // Handle existing quotes
  const hasQuotes = cleanValue.startsWith('"') && cleanValue.endsWith('"');

  if (hasQuotes) {
    // Extract content between outer quotes
    const innerContent = cleanValue.slice(1, -1);

    // Double any internal quotes (CSV standard)
    const fixedInnerContent = innerContent.replace(/"/g, '""');

    return `"${fixedInnerContent}"`;
  } else if (needsQuoting) {
    // Field needs to be quoted, escape any internal quotes by doubling them
    return `"${cleanValue.replace(/"/g, '""')}"`;
  }

  // No special handling needed
  return cleanValue;
};

// Enhanced transform stream for fixing CSV special characters
class CsvSpecialCharFixerTransform extends require("stream").Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true });
    this.headers = null;
    this.fixedRowsCount = 0;
    this.fixCounts = {
      quotes: 0,
      commas: 0,
      newlines: 0,
      controlChars: 0,
      other: 0,
    };
  }

  _transform(row, encoding, callback) {
    // Save headers on first chunk if not already saved
    if (!this.headers) {
      this.headers = Object.keys(row);
    }

    // Process each field in the row to fix special character issues
    const fixedRow = {};
    let rowWasFixed = false;

    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== "string") {
        fixedRow[key] = value;
        continue;
      }

      // Check if it's JSON
      let isJson = false;
      if (value.trim().startsWith("{") && value.trim().endsWith("}")) {
        try {
          JSON.parse(value);
          isJson = true;
          fixedRow[key] = value; // Keep JSON as-is
        } catch (e) {
          // Not valid JSON, continue with normal processing
        }
      }

      if (!isJson) {
        // Track what types of fixes were made
        if (value.includes('"')) this.fixCounts.quotes++;
        if (value.includes(",")) this.fixCounts.commas++;
        if (value.includes("\n") || value.includes("\r"))
          this.fixCounts.newlines++;
        if (/[\x00-\x1F\x7F]/.test(value)) this.fixCounts.controlChars++;
        if (/[\\|;]/.test(value)) this.fixCounts.other++;

        const fixedValue = fixCsvSpecialChars(value);
        fixedRow[key] = fixedValue;

        // Track if anything was actually fixed
        if (fixedValue !== value) {
          rowWasFixed = true;
        }
      }
    }

    if (rowWasFixed) {
      this.fixedRowsCount++;
    }

    this.push(fixedRow);
    callback();
  }
}

module.exports = {
  fixCsvSpecialChars,
  CsvSpecialCharFixerTransform,
};
