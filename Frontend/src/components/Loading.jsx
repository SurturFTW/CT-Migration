import React from "react";

function Loading({ message = "Processing...", subMessage = null }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg flex items-center space-x-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        <div>
          <p className="text-gray-700 font-medium">{message}</p>
          {subMessage && <p className="text-gray-500 text-sm">{subMessage}</p>}
        </div>
      </div>
    </div>
  );
}

export default Loading;
