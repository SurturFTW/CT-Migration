import React from "react";

const Loading = ({
  message = "Processing your request...",
  subMessage = "",
}) => {
  return (
    <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-300 flex items-center justify-center space-x-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      <div>
        <p className="text-gray-700 font-medium">{message}</p>
        {subMessage && <p className="text-gray-500 text-sm">{subMessage}</p>}
      </div>
    </div>
  );
};

export default Loading;
