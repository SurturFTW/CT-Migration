import React from "react";
import Darkmode from "darkmode-js";

function Footer() {
  const options = {
    bottom: "45px", // default: '32px'
    right: "64px", // default: '32px'
    left: "unset", // default: 'unset'
    time: "0.5s", // default: '0.3s'
    mixColor: "#fff", // default: '#fff'
    backgroundColor: "#fff", // default: '#fff'
    buttonColorDark: "#100f2c", // default: '#100f2c'
    buttonColorLight: "#fff", // default: '#fff'
    saveInCookies: false, // default: true,
    label: "🌓", // default: ''
    autoMatchOsTheme: true, // default: true
  };

  const darkmode = new Darkmode(options);
  darkmode.showWidget();

  return (
    <footer className="border-t border-gray-200 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-black text-sm">
        <p>
          {" "}
          Copyright &copy; 2013 WizRocket Inc. (“CleverTap”). All rights
          reserved. |{" "}
          <a class="text-blue-500" href="https://clevertap.com/privacy-policy/">
            {" "}
            Privacy Policy{" "}
          </a>
        </p>
      </div>
    </footer>
  );
}

export default Footer;
