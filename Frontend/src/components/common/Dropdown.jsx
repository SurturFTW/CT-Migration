import React, { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";

/**
 * A reusable dropdown component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.trigger - Element that triggers the dropdown
 * @param {React.ReactNode} props.children - Dropdown content
 * @param {string} [props.position="right"] - Position of the dropdown ('right', 'left', 'center')
 * @param {string} [props.width="56"] - Width of dropdown in Tailwind units (e.g., '56', '64')
 * @param {Function} [props.onOpenChange] - Callback when dropdown open state changes
 */
function Dropdown({
  trigger,
  children,
  position = "right",
  width = "56",
  onOpenChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const toggleDropdown = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (onOpenChange) onOpenChange(newState);
  };

  // Close dropdown when clicking outside - this is where the outside click detection happens
  useEffect(() => {
    // Only add the event listener when the dropdown is open
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        if (onOpenChange) onOpenChange(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onOpenChange]); // Add isOpen to the dependency array

  // Calculate position classes
  const getPositionClasses = () => {
    switch (position) {
      case "left":
        return "left-0";
      case "center":
        return "left-1/2 transform -translate-x-1/2";
      case "right":
      default:
        return "right-0";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Trigger */}
      <div onClick={toggleDropdown} className="cursor-pointer">
        {trigger}
      </div>

      {/* Dropdown Content */}
      {isOpen && (
        <div
          className={`absolute mt-2 w-${width} bg-white border border-gray-200 rounded-lg shadow-lg z-10 ${getPositionClasses()}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

Dropdown.propTypes = {
  trigger: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  position: PropTypes.oneOf(["right", "left", "center"]),
  width: PropTypes.string,
  onOpenChange: PropTypes.func,
};

export default Dropdown;
