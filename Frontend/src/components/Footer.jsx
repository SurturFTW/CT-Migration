import React from "react";

function Footer() {
  return (
    <footer className="border-t border-gray-200 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
        <p>CleverTap Migration Tool &copy; {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}

export default Footer;
