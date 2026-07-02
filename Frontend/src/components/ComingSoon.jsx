import React from "react";
import { ArrowLeft } from "lucide-react";
import Header from "./common/Header";
import Footer from "./common/Footer";

const ComingSoon = ({ featureName = "This Feature", onBackClick }) => {
    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header Bar */}
            <Header />

            <main className="flex-grow max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Title Section */}
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-black">
                        {featureName}
                    </h2>
                    <p className="mt-2 text-gray-600">
                        This feature is currently under development
                    </p>
                </div>

                {/* Coming Soon Card */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-300 max-w-2xl">
                    <div className="p-8 md:p-12 text-center">
                        {/* Icon Section */}
                        <div className="flex justify-center mb-6">
                            <div className="w-16 h-16 border-2 border-black rounded-full flex items-center justify-center">
                                <svg
                                    className="w-8 h-8 text-black"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    ></path>
                                </svg>
                            </div>
                        </div>

                        {/* Text Content */}
                        <h1 className="text-3xl font-bold text-black mb-4">
                            Coming Soon
                        </h1>

                        <p className="text-gray-600 mb-8 max-w-md mx-auto">
                            We're working hard to bring you this exciting new
                            feature. Stay tuned for updates!
                        </p>

                        {/* Back Button */}
                        <button
                            onClick={
                                onBackClick || (() => window.history.back())
                            }
                            className="inline-flex items-center gap-2 border-2 border-black text-black px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <Footer />
        </div>
    );
};

export default ComingSoon;
