import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

/**
 * A reusable alert message component for success, error, info, and warning messages
 * @param {Object} props - Component props
 * @param {string} props.type - Message type: 'success', 'error', 'warning', 'info'
 * @param {string} props.message - The message to display
 * @param {Array} [props.details] - Optional array of detail messages
 * @param {boolean} [props.showIcon=true] - Whether to show the icon
 * @param {number} [props.autoHideDuration=0] - Duration in ms after which the message will auto-hide (0 = no auto-hide)
 * @param {Function} [props.onClose] - Callback when message is closed
 * @param {boolean} [props.dismissible=true] - Whether the message can be dismissed by the user
 */
function AlertMessage({
  type = "info",
  message,
  details = [],
  showIcon = true,
  autoHideDuration = 0,
  onClose,
  dismissible = true,
}) {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-hide functionality
  useEffect(() => {
    if (autoHideDuration > 0 && isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onClose) onClose();
      }, autoHideDuration);

      return () => clearTimeout(timer);
    }
  }, [autoHideDuration, onClose, isVisible]);

  // Reset visibility when message changes
  useEffect(() => {
    setIsVisible(true);
  }, [message]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  if (!isVisible || !message) return null;

  // Configure styles based on message type
  const config = {
    success: {
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      textColor: "text-green-800",
      icon: "fas fa-check-circle",
    },
    error: {
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      textColor: "text-red-800",
      icon: "fas fa-exclamation-circle",
    },
    warning: {
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      textColor: "text-orange-800",
      icon: "fas fa-exclamation-triangle",
    },
    info: {
      bgColor: "bg-gray-50",
      borderColor: "border-gray-200",
      textColor: "text-gray-800",
      icon: "fas fa-info-circle",
    },
  };

  const { bgColor, borderColor, textColor, icon } = config[type] || config.info;

  return (
    <div
      className={`${bgColor} border-l-4 ${borderColor} ${textColor} p-4 rounded-lg mb-6`}
      role="alert"
      data-testid={`alert-${type}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-start">
          {showIcon && (
            <i className={`${icon} mr-3 text-lg mt-0.5`} aria-hidden="true"></i>
          )}
          <div>
            <div className="font-medium">{message}</div>
            {details && details.length > 0 && (
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm">
                {details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="ml-4 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>
    </div>
  );
}

AlertMessage.propTypes = {
  type: PropTypes.oneOf(["success", "error", "warning", "info"]),
  message: PropTypes.string.isRequired,
  details: PropTypes.arrayOf(PropTypes.string),
  showIcon: PropTypes.bool,
  autoHideDuration: PropTypes.number,
  onClose: PropTypes.func,
  dismissible: PropTypes.bool,
};

export default AlertMessage;
