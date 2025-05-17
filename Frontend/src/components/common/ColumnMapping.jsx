import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

const ColumnMapping = ({
  columns = [],
  initialMappings = [],
  onMappingsChange,
  allowCustomColumns = false,
  onAddCustomColumn,
}) => {
  const [mappings, setMappings] = useState([]);
  const [showAddColumnForm, setShowAddColumnForm] = useState(false);
  const [newColumn, setNewColumn] = useState({
    name: "",
    clevertap_name: "",
    type: "string",
    value: "", // Default value to populate in all rows
  });

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

  // Handle value change for custom columns
  const handleValueChange = (index, value) => {
    const updatedMappings = [...mappings];
    updatedMappings[index].value = value;
    setMappings(updatedMappings);
  };

  // Handle removing a column
  const handleRemoveColumn = (index) => {
    const updatedMappings = [...mappings];
    updatedMappings.splice(index, 1);
    setMappings(updatedMappings);
  };

  // Handle adding a custom column
  const handleAddCustomColumn = () => {
    if (!newColumn.name || !newColumn.clevertap_name) {
      return;
    }

    // Check for existing column with the same name
    const exists = mappings.some(
      (mapping) =>
        mapping.csv_name === newColumn.name ||
        mapping.clevertap_name === newColumn.clevertap_name
    );

    if (exists) {
      if (onAddCustomColumn) {
        onAddCustomColumn({
          success: false,
          message: "Column with this name already exists",
        });
      }
      return;
    }

    const customColumn = {
      csv_name: newColumn.name,
      clevertap_name: newColumn.clevertap_name,
      type: newColumn.type,
      value: newColumn.value,
      isCustom: true,
    };

    const updatedMappings = [...mappings, customColumn];
    setMappings(updatedMappings);

    // Reset form
    setNewColumn({
      name: "",
      clevertap_name: "",
      type: "string",
      value: "",
    });

    setShowAddColumnForm(false);

    // Notify parent component
    if (onAddCustomColumn) {
      onAddCustomColumn({
        success: true,
        message: `Custom column "${newColumn.name}" added successfully`,
        column: customColumn,
      });
    }
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
                  className={`border-b hover:bg-gray-50 transition-colors ${
                    mapping.isCustom ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-7 py-3 text-gray-600">
                    <div>
                      <div className="flex items-center">
                        {mapping.csv_name}
                        {mapping.isCustom && (
                          <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            Custom
                          </span>
                        )}
                      </div>

                      {/* Show value input for custom columns */}
                      {mapping.isCustom && (
                        <div className="mt-2">
                          <div className="flex items-center">
                            <label className="block text-xs font-medium text-gray-500 mr-2">
                              Default value:
                            </label>
                            <input
                              type="text"
                              value={mapping.value || ""}
                              onChange={(e) =>
                                handleValueChange(index, e.target.value)
                              }
                              placeholder="Value for all rows"
                              className="text-xs px-2 py-1 border rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none w-48"
                            />
                          </div>
                        </div>
                      )}
                    </div>
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

      {/* Add custom column section */}
      {allowCustomColumns && (
        <div className="mt-4">
          {!showAddColumnForm ? (
            <button
              onClick={() => setShowAddColumnForm(true)}
              className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <i className="fas fa-plus-circle mr-2"></i> Add Custom Column
            </button>
          ) : (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h4 className="font-medium text-gray-700 mb-3">
                Add Custom Column
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CSV Column Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., custom_field"
                    value={newColumn.name}
                    onChange={(e) =>
                      setNewColumn({ ...newColumn, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CleverTap Field
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Custom Field"
                    value={newColumn.clevertap_name}
                    onChange={(e) =>
                      setNewColumn({
                        ...newColumn,
                        clevertap_name: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Type
                  </label>
                  <div className="relative">
                    <select
                      value={newColumn.type}
                      onChange={(e) =>
                        setNewColumn({ ...newColumn, type: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 outline-none appearance-none pr-8"
                    >
                      <option value="string">String</option>
                      <option value="integer">Integer</option>
                      <option value="float">Float</option>
                      <option value="boolean">Boolean</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <i className="fas fa-chevron-down text-gray-400"></i>
                    </div>
                  </div>
                </div>
              </div>

              {/* Default value field moved under the main fields */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Value
                </label>
                <input
                  type="text"
                  placeholder="Value to populate in all rows"
                  value={newColumn.value}
                  onChange={(e) =>
                    setNewColumn({ ...newColumn, value: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This value will be added to all rows in the CSV file for this
                  custom column.
                </p>
              </div>

              <div className="flex justify-end mt-4 space-x-3">
                <button
                  onClick={() => setShowAddColumnForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomColumn}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                  disabled={!newColumn.name || !newColumn.clevertap_name}
                >
                  Add Column
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
      isCustom: PropTypes.bool,
      value: PropTypes.string,
    })
  ),

  /** Callback function when mappings change */
  onMappingsChange: PropTypes.func,

  /** Whether to allow adding custom columns */
  allowCustomColumns: PropTypes.bool,

  /** Callback function for custom column add operations */
  onAddCustomColumn: PropTypes.func,
};

export default ColumnMapping;
