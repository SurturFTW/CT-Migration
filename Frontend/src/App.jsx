import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import SftpGenerator from "./components/GenerateSFTP";
import JsonConverter from "./components/JsonConverter";
import ChargedEventUpload from "./components/ChargedEventUpload";

import CSVSplitter from "./components/CSVSplitter";
import PhoneNumberProcessor from "./components/PhoneNumber";
// import CleverTapUploader from "./components/EventUploader";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sftp-generator" element={<SftpGenerator />} />
        <Route path="/json-converter" element={<JsonConverter />} />
        <Route path="/ChargedEventUpload" element={<ChargedEventUpload />} />

        <Route path="/CSVSplit" element={<CSVSplitter />} />
        <Route path="/PhoneNumber" element={<PhoneNumberProcessor />} />
        {/* <Route path="/CleverTapUploader" element={<CleverTapUploader />} /> */}
      </Routes>
    </Router>
  );
}

export default App;
