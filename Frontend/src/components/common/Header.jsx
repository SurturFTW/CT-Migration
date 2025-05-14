import React from "react";
import { useNavigate } from "react-router-dom";

function Header({ rightContent }) {
  const navigate = useNavigate();
  const accountName = localStorage.getItem("accountName") || "Guest";

  const handleSignOut = () => {
    localStorage.removeItem("accountName");
    localStorage.removeItem("email");
    navigate("/");
  };

  return (
    <header className="border-b border-gray-300 shadow-sm bg-white">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <img
            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQs3HIP6KVjw__rXq77tiPB15-LlaBYpUfFPQ&s"
            alt="Logo"
            className="w-10 h-10 rounded-full border-2 border-black"
            onClick={() => navigate("/dashboard")}
          />
          <h1 className="text-xl font-bold tracking-tight text-black">
            CleverPort - Data Migration
          </h1>
        </div>

        {/* Display custom right content if provided, otherwise show default account info */}
        {rightContent ? (
          rightContent
        ) : (
          <div className="flex items-center space-x-4">
            {accountName !== "Guest" && (
              <>
                <span className="text-sm text-black">
                  Welcome, {accountName}
                </span>
                <button
                  onClick={handleSignOut}
                  className="border border-black text-black px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-50 transition"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
