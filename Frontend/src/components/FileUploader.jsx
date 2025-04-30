import React, { useState, useRef, useEffect, useCallback } from "react";

function FileUploader({
  accept = "*/*",
  maxSize = 5, // in GB
  onFileSelect,
  onError,
  supportedFormats = "All files",
  showPreview = true,
  disabled = false,
}) {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Handle selected files
  const handleFiles = useCallback(
    (e) => {
      const files = e.target.files || (e.dataTransfer && e.dataTransfer.files);

      if (files && files.length > 0) {
        const file = files[0];

        // Check file size (convert maxSize from GB to bytes)
        const maxSizeInBytes = maxSize * 1024 * 1024 * 1024; // Convert GB to bytes
        if (file.size > maxSizeInBytes) {
          if (onError) {
            onError(`File is too large. Maximum size is ${maxSize}GB.`);
          }
          return;
        }

        // Check file type if accept is specified and not wildcard
        if (accept !== "*/*") {
          const fileType = file.type;
          const fileExtension = `.${file.name.split(".").pop().toLowerCase()}`;
          const acceptValues = accept.split(",").map((type) => type.trim());

          // Check if file type or extension matches any accepted values
          const isAccepted = acceptValues.some((acceptValue) => {
            // Handle mime type (e.g., "image/png")
            if (acceptValue.includes("/")) {
              // Handle wildcards like "image/*"
              if (acceptValue.endsWith("/*")) {
                const category = acceptValue.split("/")[0];
                return fileType.startsWith(`${category}/`);
              }
              return fileType === acceptValue;
            }
            // Handle file extensions (e.g., ".json")
            return fileExtension === acceptValue;
          });

          if (!isAccepted) {
            if (onError) {
              onError(`Please select a valid file format: ${supportedFormats}`);
            }
            return;
          }
        }

        setSelectedFile(file);
        setSelectedFileName(file.name);

        if (onFileSelect) {
          onFileSelect(file);
        }
      }
    },
    [maxSize, accept, onFileSelect, onError, supportedFormats]
  );

  // Handle file clear
  const handleClearFile = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setSelectedFile(null);
    setSelectedFileName("");

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (onFileSelect) {
      onFileSelect(null);
    }
  };

  // Handle drag and drop functionality
  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const highlight = () => {
      if (!disabled) {
        dropZone.classList.add("border-gray-400");
      }
    };

    const unhighlight = () => {
      dropZone.classList.remove("border-gray-400");
    };

    const handleDrop = (e) => {
      if (disabled) return;

      const dt = e.dataTransfer;
      const files = dt.files;
      handleFiles({ dataTransfer: { files } });
    };

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, highlight, false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener("drop", handleDrop, false);

    return () => {
      // Clean up event listeners
      ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dropZone.removeEventListener(eventName, preventDefaults, false);
        document.body.removeEventListener(eventName, preventDefaults, false);
      });

      ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.removeEventListener(eventName, highlight, false);
      });

      ["dragleave", "drop"].forEach((eventName) => {
        dropZone.removeEventListener(eventName, unhighlight, false);
      });

      dropZone.removeEventListener("drop", handleDrop, false);
    };
  }, [handleFiles, disabled]);

  return (
    <div
      ref={dropZoneRef}
      className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center ${
        !disabled ? "hover:border-gray-400" : "opacity-60"
      } transition-colors`}
    >
      <input
        type="file"
        id="fileUpload"
        ref={fileInputRef}
        accept={accept}
        className="hidden"
        onChange={handleFiles}
        disabled={disabled}
      />
      <label
        htmlFor="fileUpload"
        className={disabled ? "cursor-not-allowed" : "cursor-pointer"}
      >
        <i className="fas fa-cloud-upload-alt text-5xl text-gray-400 mb-4 block"></i>
        <span className="text-gray-600 font-medium">
          Drag and drop your file here, or
        </span>
        <span className="block mt-2 text-gray-800 font-semibold">
          Browse Files
        </span>
        {showPreview && selectedFileName && (
          <div className="mt-3">
            <span className="text-sm text-gray-500">
              Selected file: {selectedFileName}
            </span>
            <button
              onClick={handleClearFile}
              className="ml-2 text-sm text-red-500 hover:text-red-700"
              title="Remove file"
              disabled={disabled}
            >
              <i className="fas fa-times-circle"></i>
            </button>
          </div>
        )}
        <div className="mt-6 text-gray-500 text-sm">
          <p>Maximum file size: {maxSize} GB</p>
          <p>Supported format: {supportedFormats}</p>
        </div>
      </label>
    </div>
  );
}

export default FileUploader;
