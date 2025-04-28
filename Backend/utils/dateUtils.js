// Datetime conversion utility function
const convertToEpoch = (value, columnName) => {
  if (typeof value !== "string") return value;

  // Check if it's already in $D_epoch format
  if (value.startsWith("$D_") && !isNaN(value.substring(3))) {
    const epochValue = parseInt(value.substring(3), 10);

    // For ts columns, remove the $D_ prefix and return just the epoch value
    if (columnName && columnName.toLowerCase() === "ts") {
      return epochValue;
    }

    return value; // Keep $D_epoch format for non-ts columns
  }

  // Handle specific formats that standard Date parsing struggles with
  // Handle DD-MM-YYYY format explicitly
  const dmyRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  if (dmyRegex.test(value)) {
    const [, day, month, year] = dmyRegex.exec(value);
    // Note: JS months are 0-indexed
    const dateObj = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10)
    );
    if (!isNaN(dateObj.getTime())) {
      const epochSeconds = Math.floor(dateObj.getTime() / 1000);
      if (columnName && columnName.toLowerCase() === "ts") {
        return epochSeconds;
      }
      return `$D_${epochSeconds}`;
    }
  }

  // Handle formats with ordinals like "3rd"
  const ordinalDateRegex =
    /^(\w{3})\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w{3,9})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i;
  if (ordinalDateRegex.test(value)) {
    const [, dayOfWeek, day, month, year, hour, minute, ampm] =
      ordinalDateRegex.exec(value);

    // Convert month name to month number (0-based)
    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const monthIndex = monthNames.findIndex((m) =>
      m.toLowerCase().startsWith(month.toLowerCase())
    );

    if (monthIndex !== -1) {
      let hours = parseInt(hour, 10);

      // Handle AM/PM
      if (ampm && ampm.toLowerCase() === "pm" && hours < 12) {
        hours += 12;
      } else if (ampm && ampm.toLowerCase() === "am" && hours === 12) {
        hours = 0;
      }

      const dateObj = new Date(
        parseInt(year, 10),
        monthIndex,
        parseInt(day, 10),
        hours,
        parseInt(minute, 10)
      );
      if (!isNaN(dateObj.getTime())) {
        const epochSeconds = Math.floor(dateObj.getTime() / 1000);
        if (columnName && columnName.toLowerCase() === "ts") {
          return epochSeconds;
        }
        return `$D_${epochSeconds}`;
      }
    }
  }

  // Comprehensive datetime regex to match various formats
  const dateTimeRegexes = [
    /^\w{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+\w{3,9}\s+\d{4}\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i, // Sat 3rd October 2020 12:44 pm
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY /^\w{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+\w{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?)?$/i, // Sat 3rd October 2020 [12:44 pm]
    /^(?:\d{1,2}|\d{2})-(?:\d{1,2}|\d{2})-\d{4}$/, // DD-MM-YYYY (more flexible)
    /^\d{1,2}\/\d{1,2}\/\d{2}$/, // DD/MM/YY or MM/DD/YY
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/, // Basic YYYY-MM-DD HH:MM:SS
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\.\d+)?\s*(UTC|GMT|Z)?$/i, // Standard format
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|\+\d{2}:\d{2}|-\d{2}:\d{2})?$/i, // ISO 8601
    /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{2}:\d{2}:\d{2}(\s*(AM|PM))?$/i, // US format full year
    /^\d{1,2}\/\d{1,2}\/\d{2}\s+\d{1,2}:\d{2}(\s*(AM|PM))?$/i, // US format short year HH:MM
    /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}$/i, // Alternate format
    /^\d{1,2}\s+\w{3,9}\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}(\s*(GMT|UTC|Z))?$/i, // DD Month YYYY HH:MM:SS
    /^\w{3,9}\s+\d{1,2}\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}(\s*(GMT|UTC|Z))?$/i, // Month DD YYYY HH:MM:SS
    /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i, // YYYY-MM-DD HH:MM[:SS] [AM/PM]
    /^\w{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+\w{3,9}\s+\d{4}/, // Starts with Sat 3rd October 2020
  ];

  // Try each regex pattern
  for (const regex of dateTimeRegexes) {
    if (regex.test(value.trim())) {
      try {
        // For better compatibility, try removing ordinals before parsing
        const valueWithoutOrdinal = value.replace(/(\d+)(st|nd|rd|th)/g, "$1");

        // Parse the datetime string and convert to epoch
        const dateObj = new Date(valueWithoutOrdinal);

        // Check if the parsed date is valid
        if (!isNaN(dateObj.getTime())) {
          // Convert to seconds (divide by 1000 and floor to get integer seconds)
          const epochSeconds = Math.floor(dateObj.getTime() / 1000);

          // Return as plain epoch number for "ts" columns
          if (columnName && columnName.toLowerCase() === "ts") {
            return epochSeconds;
          }

          // For other columns with datetime, return in $D_epoch format
          return `$D_${epochSeconds}`;
        }
      } catch (error) {
        // If parsing fails, continue to next iteration
        continue;
      }
    }
  }

  // If no conversion succeeded, return original value
  return value;
};

const isLikelyDateTime = (value) => {
  // Keep existing implementation
  if (typeof value !== "string") return false;
  if (value.length < 8) return false; // Too short to be a date

  // Check for common date/time patterns
  const dateTimeRegexes = [
    /^\w{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+\w{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?)?$/i, // Sat 3rd October 2020 [12:44 pm]
    /^(?:\d{1,2}|\d{2})-(?:\d{1,2}|\d{2})-\d{4}$/, // DD-MM-YYYY (more flexible)
    /^\d{1,2}\/\d{1,2}\/\d{2}$/, // DD/MM/YY or MM/DD/YY
    /^\d{1,2}\/\d{1,2}\/\d{2}/, // Starts with MM/DD/YY
    /^\d{1,2}\/\d{1,2}\/\d{2}\s+\d{1,2}:\d{2}/, // MM/DD/YY HH:MM
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/, // YYYY-MM-DD HH:MM:SS
    /^\d{4}-\d{2}-\d{2}/, // Starts with YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}/, // Starts with MM/DD/YYYY or DD/MM/YYYY
    /^\d{4}\/\d{2}\/\d{2}/, // Starts with YYYY/MM/DD
    /^\d{1,2}-\d{1,2}-\d{4}/, // Starts with D-M-YYYY or DD-MM-YYYY
    /^\w{3}\s+\d{1,2},?\s+\d{4}/, // Starts with Mon DD, YYYY
    /^\d{1,2}\s+\w{3}\s+\d{4}/, // Starts with DD Mon YYYY
    /^\d{1,2}\s+\w{3,9}\s+\d{4}/, // Matches "13 March 2025" format
    /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/, // YYYY-MM-DD HH:MM
    /^\w{3}\s+\d{1,2}(?:st|nd|rd|th)?\s+\w{3,9}\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)?$/i, // Sat 3rd October 2020 12:44 pm
  ];

  return dateTimeRegexes.some((regex) => regex.test(value.trim()));
};

module.exports = {
  convertToEpoch,
  isLikelyDateTime,
};
