import React, { useEffect } from "react";
import Darkmode from "darkmode-js";

function Footer() {
  useEffect(() => {
    const options = {
      bottom: "45px",
      right: "64px",
      left: "unset",
      time: "0.5s",
      mixColor: "#fff",
      backgroundColor: "#fff",
      buttonColorDark: "#100f2c",
      buttonColorLight: "#fff",
      saveInCookies: false,
      label: "🌓",
      autoMatchOsTheme: false,
    };
    const darkmode = new Darkmode(options);
    darkmode.showWidget();
  }, []); // Only run once when component mounts

  return (
    <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-black text-sm">
        <p>
          {" "}
          Copyright &copy; 2013 WizRocket Inc. (“CleverTap”). All rights
          reserved. |{" "}
          <a
            className="text-blue-500"
            href="https://clevertap.com/privacy-policy/"
          >
            {" "}
            Privacy Policy{" "}
          </a>
        </p>
      </div>
    </footer>
  );
}

export default Footer;
