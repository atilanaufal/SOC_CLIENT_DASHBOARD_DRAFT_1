'use client';

import React, { useState, useEffect } from 'react';
import { HiOutlineXMark, HiOutlineAdjustmentsHorizontal, HiOutlineArrowPath } from 'react-icons/hi2';

export interface FilterSection {
  key: string;
  label: string;
  type: 'buttons' | 'select';
  options: string[];
}

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: Record<string, string>) => void;
  initialFilters?: Record<string, string>;
  sections: FilterSection[];
  title?: string;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialFilters = {},
  sections,
  title = 'Filter Options',
}) => {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const defaults: Record<string, string> = {};
      sections.forEach((s) => {
        defaults[s.key] = initialFilters[s.key] || 'All';
      });
      setValues(defaults);
    }
  }, [isOpen, sections, initialFilters]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(values);
    onClose();
  };

  const handleReset = () => {
    const defaults: Record<string, string> = {};
    sections.forEach((s) => {
      defaults[s.key] = 'All';
    });
    setValues(defaults);
    onApply(defaults);
    onClose();
  };

  const updateValue = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  return (
    /* Outer Backdrop Overlay - Clicking outside closes modal */
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
    >
      {/* Inner Modal Card - Stop propagation so clicking inside doesn't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg border border-gray-300 max-w-lg w-full overflow-hidden p-5 space-y-4 shadow-2xl text-gray-900 animate-in zoom-in-95 duration-150 cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2 font-black text-base text-navy-800">
            <HiOutlineAdjustmentsHorizontal className="w-5 h-5 text-blue-700" />
            <span>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1 rounded-md transition"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Filter Sections */}
        <div className="space-y-3.5 text-sm font-bold max-h-[50vh] overflow-y-auto">
          {sections.map((section) => (
            <div key={section.key}>
              <label className="block text-gray-500 uppercase tracking-wider text-xs font-extrabold mb-1.5">
                {section.label}
              </label>

              {section.type === 'buttons' ? (
                <div className="flex flex-wrap gap-1.5">
                  {['All', ...section.options].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateValue(section.key, opt)}
                      className={`py-1.5 px-3 rounded-md font-bold transition border text-xs ${
                        values[section.key] === opt
                          ? 'bg-navy-800 text-white border-navy-800 shadow-xs'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  value={values[section.key] || 'All'}
                  onChange={(e) => updateValue(section.key, e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-800"
                >
                  <option value="All">All</option>
                  {section.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-xs rounded-md transition flex items-center gap-1.5"
          >
            <HiOutlineArrowPath className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 bg-navy-800 hover:bg-navy-900 text-white font-extrabold text-xs rounded-md transition shadow-xs"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};
