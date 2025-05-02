import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

const ColumnMapping = ({
  columns = [],
  initialMappings = [],
  onMappingsChange,
}) => {
  const [mappings, setMappings] = useState([]);

  // Initialize mappings from props or create from columns
  useEffect(() => {
    if (initialMappings && initialMappings.length > 0) {
      setMappings(initialMappings);
    } else if (columns && columns.length > 0) {
      const newMappings = columns.map((column) => ({
        csv_name: column,
        clevertap_name: column,
        type: "string",
      }));
      setMappings(newMappings);
    }
  }, [columns, initialMappings]);

  // Notify parent component when mappings change
  useEffect(() => {
    if (onMappingsChange && mappings.length > 0) {
      onMappingsChange(mappings);
    }
  }, [mappings, onMappingsChange]);

  // Handle field name change
  const handleNameChange = (index, value) => {
    const updatedMappings = [...mappings];
    updatedMappings[index].clevertap_name = value;
    setMappings(updatedMappings);
  };

  // Handle field type change
  const handleTypeChange = (index, value) => {
    const updatedMappings = [...mappings];
    updatedMappings[index].type = value;
    setMappings(updatedMappings);
  };

  // Handle removing a column
  const handleRemoveColumn = (index) => {
    const updatedMappings = [...mappings];
    updatedMappings.splice(index, 1);
    setMappings(updatedMappings);
  };

  return (
    <div className="space-y-2">
      {/* Counter at the top of the table */}
      <div className="flex justify-between items-center px-2">
        <div className="text-sm text-gray-500">
          <i className="fas fa-info-circle mr-1"></i>
          Mapping your CSV columns to Clevertap fields
        </div>
        <div className="text-sm font-medium text-gray-600">
          {mappings.length} columns mapped
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-gray-300">
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="border-b border-gray-300">
              <tr>
                <th className="px-7 py-3 text-left text-sm font-semibold text-gray-700 w-[35%]">
                  <div className="flex items-center">
                    <i className="fas fa-table text-gray-500 mr-2"></i>
                    CSV Column
                  </div>
                </th>
                <th className="px-7 py-3 text-left text-sm font-semibold text-gray-700 w-[40%]">
                  <div className="flex items-center">
                    <i className="fas fa-tag text-gray-500 mr-2"></i>
                    Clevertap Field
                  </div>
                </th>
                <th className="px-7 py-3 text-left text-sm font-semibold text-gray-700 w-[20%]">
                  <div className="flex items-center">
                    <i className="fas fa-code text-gray-500 mr-2"></i>
                    Data Type
                  </div>
                </th>
                <th className="px-5 py-3 text-center text-sm font-semibold text-gray-700 w-[5%]">
                  <div className="flex items-center justify-center">
                    <i className="fas fa-times text-gray-500"></i>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => (
                <tr
                  key={index}
                  className="border-b hover:bg-gray-50 transition-colors"
                >
                  <td className="px-7 py-3 text-gray-600">
                    {mapping.csv_name}
                  </td>
                  <td className="px-7 py-3">
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 outline-none transition-all"
                      value={mapping.clevertap_name}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                    />
                  </td>
                  <td className="px-7 py-3">
                    <div className="relative">
                      <select
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 outline-none appearance-none transition-all pr-8 bg-white text-gray-700"
                        value={mapping.type}
                        onChange={(e) =>
                          handleTypeChange(index, e.target.value)
                        }
                      >
                        <option value="string">String</option>
                        <option value="integer">Integer</option>
                        <option value="float">Float</option>
                        <option value="boolean">Boolean</option>
                        <option value="date">Date</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                        <i className="fas fa-chevron-down text-gray-400"></i>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveColumn(index)}
                      className="text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

ColumnMapping.propTypes = {
  /** Array of column names from the CSV */
  columns: PropTypes.arrayOf(PropTypes.string),

  /** Initial mappings if available */
  initialMappings: PropTypes.arrayOf(
    PropTypes.shape({
      csv_name: PropTypes.string.isRequired,
      clevertap_name: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
    })
  ),

  /** Callback function when mappings change */
  onMappingsChange: PropTypes.func,
};

export default ColumnMapping;
