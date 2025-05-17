// Function to validate special characters in CSV fields
const validateSpecialChars = (value) => {
  if (value === "") return null; // Allow empty fields
  if (value === null || value === undefined) return null; // Allow null/undefined

  // Convert to string if not already
  const strValue = String(value);

  const issues = [];

  // Check if it's a valid JSON string (to allow JSON data)
  try {
    JSON.parse(strValue);
    // If this is valid JSON, don't apply other validation rules
    return null;
  } catch (e) {
    // Not JSON, continue with normal validation
  }

  // Allow repeated values with commas (like "Amazon,Amazon,Amazon")
  const repeatedValuePattern = /^(\w+)(,\1)+$/;
  if (repeatedValuePattern.test(strValue)) {
    return null; // This is a valid pattern, not an error
  }

  // Check for mismatched quotes
  const quoteCount = (strValue.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    issues.push("Mismatched opening/closing quotes");
  }

  // Check for unescaped quotes in the middle of the string
  if (strValue.includes('"')) {
    // First, check if it's properly wrapped (starts and ends with quote)
    const isWrapped = strValue.startsWith('"') && strValue.endsWith('"');

    if (isWrapped) {
      // For wrapped strings, get the content inside the wrapping quotes
      const innerContent = strValue.slice(1, -1);
      // All quotes inside should be escaped
      if (innerContent.includes('"') && !innerContent.includes('\\"')) {
        issues.push("Unescaped double quotes inside quoted string");
      }
    } else {
      // For unwrapped strings, any quote should be escaped
      const unescapedQuoteRegex = /(?<!\\)"/g;
      if (unescapedQuoteRegex.test(strValue)) {
        issues.push("Unescaped double quotes");
      }
    }
  }

  // Check for CSV-problematic characters that would require quotes
  const csvSpecialChars = ["\n", "\r"]; // Removed comma from here to allow comma-separated lists
  for (const char of csvSpecialChars) {
    if (
      strValue.includes(char) &&
      !(strValue.startsWith('"') && strValue.endsWith('"'))
    ) {
      issues.push(`Unquoted field with ${char === "," ? "comma" : "newline"}`);
    }
  }

  // Special case for commas - check if it's a list-like pattern
  if (
    strValue.includes(",") &&
    !(strValue.startsWith('"') && strValue.endsWith('"'))
  ) {
    // Allow comma-separated values that follow a pattern
    const parts = strValue.split(",");
    const allPartsValid = parts.every((part) => part.trim().length > 0);

    // If not all parts are valid, then it's an error
    if (!allPartsValid) {
      issues.push("Unquoted field with comma");
    }
  }

  // Check for control characters that might cause issues
  const controlCharRegex = /[\x00-\x1F\x7F]/g;
  const controlChars = strValue.match(controlCharRegex);
  if (controlChars && controlChars.length > 0) {
    issues.push(
      `Contains control characters: ${Array.from(new Set(controlChars))
        .map((c) => `0x${c.charCodeAt(0).toString(16)}`)
        .join(", ")}`
    );
  }

  // Check for other potentially problematic characters
  /* const otherSpecialChars = /[\\|;]/g;
  if (
    otherSpecialChars.test(strValue) &&
    !(strValue.startsWith('"') && strValue.endsWith('"'))
  ) {
    issues.push("Contains special characters that should be quoted");
  } */

  return issues.length > 0 ? issues.join("; ") : null;
};

// Function to validate email format
const validateEmail = (email) => {
  if (!email) return null; // Allow empty fields
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return "Invalid email format";
  }
  return null;
};

// Function to validate phone number format (checks for country code)
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null; // Allow empty fields

  // Basic regex to check for international format with country code
  // Matches formats like: +1234567890, +12 34567890, +12-345-678-90, etc.
  const phoneRegex = /^\+[1-9]\d{0,3}[ -]?\d{1,14}$/;

  if (!phoneRegex.test(phoneNumber)) {
    return "Missing country code or invalid phone format";
  }

  return null;
};

module.exports = {
  validateSpecialChars,
  validateEmail,
  validatePhoneNumber,
};
