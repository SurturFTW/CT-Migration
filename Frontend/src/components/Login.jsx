import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const [accountName, setAccountName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    // Add your authentication logic here
    console.log("Login attempt with:", { accountName, email, password });

    // Example validation
    if (!accountName || !email || !password) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    // Reset error message
    setErrorMessage("");

    // Store user info in localStorage
    localStorage.setItem("accountName", accountName);
    localStorage.setItem("email", email);

    // Navigate to dashboard
    navigate("/dashboard");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-xl rounded-lg p-10 w-[500px] border border-gray-300">
        <div className="flex items-center justify-center space-x-6 mb-8">
          <img
            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQs3HIP6KVjw__rXq77tiPB15-LlaBYpUfFPQ&s"
            alt="Logo"
            className="w-20 h-20 rounded-full shadow-md"
          />
          <h2 className="text-3xl font-semibold text-black">
            CleverTap Migration - Login
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="accountName"
              className="block text-base font-medium text-gray-800 mb-2"
            >
              Account Name
            </label>
            <input
              type="text"
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base"
              required
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-base font-medium text-gray-800 mb-2"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-base font-medium text-gray-800 mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-base"
              required
            />
          </div>

          {errorMessage && (
            <p className="text-red-600 text-sm">{errorMessage}</p>
          )}

          <button
            type="submit"
            className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition text-lg font-medium mt-2"
          >
            Login
          </button>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-black text-sm">
            <p>
              Need additional support? Visit our
              <a
                class="text-blue-500"
                href="https://help.clevertap.com/hc/en-us"
              >
                {" "}
                Help Center
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
