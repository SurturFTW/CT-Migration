import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import SftpGenerator from "./components/GenerateSFTP";
import JsonConverter from "./components/JsonConverter";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sftp-generator" element={<SftpGenerator />} />
        <Route path="/json-converter" element={<JsonConverter />} />
      </Routes>
    </Router>
  );
}

export default App;
