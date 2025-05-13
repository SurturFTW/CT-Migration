import React from "react";
import { useNavigate } from "react-router-dom";
import Header from "./common/Header";
import Footer from "./common/Footer";

function Dashboard() {
  const navigate = useNavigate();

  const handleOptionClick = (path) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header Bar */}
      <Header />

      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Title Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-black">Migration Dashboard</h2>
          <p className="mt-2 text-gray-600">
            Select a tool to begin your data migration process
          </p>
        </div>

        {/* Tools Grid with Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* JSON to CSV Converter */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-300 transition duration-300 hover:shadow-lg">
            <div className="p-6">
              <div className="w-12 h-12 border-2 border-black rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  ></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-2">
                JSON to CSV Converter
              </h3>
              <p className="text-gray-600 mb-6">
                Convert JSON data to CSV format for easier data manipulation and
                compatibility with spreadsheet applications.
              </p>
              <button
                onClick={() => handleOptionClick("/json-converter")}
                className="w-full border-2 border-black text-black px-6 py-3 rounded-lg hover:bg-gray-50 transition flex items-center justify-center"
              >
                <span className="font-medium">Start</span>
                <svg
                  className="w-5 h-5 ml-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  ></path>
                </svg>
              </button>
            </div>
          </div>

          {/* Generate SFTP Files */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-300 transition duration-300 hover:shadow-lg">
            <div className="p-6">
              <div className="w-12 h-12 border-2 border-black rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                  ></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-2">
                Generate SFTP Files
              </h3>
              <p className="text-gray-600 mb-6">
                Create and prepare files for secure transfer using SFTP. Format
                and organize your migration data.
              </p>
              <button
                onClick={() => handleOptionClick("/sftp-generator")}
                className="w-full border-2 border-black text-black px-6 py-3 rounded-lg hover:bg-gray-50 transition flex items-center justify-center"
              >
                <span className="font-medium">Start</span>
                <svg
                  className="w-5 h-5 ml-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  ></path>
                </svg>
              </button>
            </div>
          </div>

          {/* Upload using API */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-300 transition duration-300 hover:shadow-lg">
            <div className="p-6">
              <div className="w-12 h-12 border-2 border-black rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  ></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-2">
                Upload using API
              </h3>
              <p className="text-gray-600 mb-6">
                Directly upload your migration data to the destination platform
                using our secure API integration.
              </p>
              <button
                onClick={() => handleOptionClick("/ChargedEventUpload")}
                className="w-full border-2 border-black text-black px-6 py-3 rounded-lg hover:bg-gray-50 transition flex items-center justify-center"
              >
                <span className="font-medium">Start</span>
                <svg
                  className="w-5 h-5 ml-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  ></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default Dashboard;
