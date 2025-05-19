import React from "react";
import PropTypes from "prop-types";

/**
 * A reusable progress tracker component that displays a horizontal
 * step progression with labeled steps.
 */
function ProgressTracker({ steps, currentStep }) {
  return (
    <div className="flex justify-between items-center mb-8 px-8">
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          {/* Step circle with number */}
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-2 ${
                currentStep >= index + 1
                  ? "bg-black text-white"
                  : "bg-gray-300 text-gray-500"
              }`}
            >
              {index + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                currentStep >= index + 1 ? "text-black" : "text-gray-500"
              }`}
            >
              {step}
            </span>
          </div>

          {/* Connecting line (except after the last step) */}
          {index < steps.length - 1 && (
            <div
              className={`h-1 flex-grow mx-2 ${
                currentStep > index + 1 ? "bg-black" : "bg-gray-300"
              }`}
            ></div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

ProgressTracker.propTypes = {
  /** Array of step names to be displayed */
  steps: PropTypes.arrayOf(PropTypes.string).isRequired,
  /** Current active step (1-based index) */
  currentStep: PropTypes.number.isRequired,
};

export default ProgressTracker;
