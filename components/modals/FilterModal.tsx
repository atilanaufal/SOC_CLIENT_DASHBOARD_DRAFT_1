'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineXMark,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineChevronDown,
  HiOutlineCheck,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2';

export interface FilterSection {
  key: string;
  label: string;
  type: 'buttons' | 'select';
  options: string[];
  isMultiSelect?: boolean;
}

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: Record<string, string>) => void;
  initialFilters?: Record<string, string>;
  sections: FilterSection[];
  title?: string;
}

// Custom Modern Dropdown Component replacing basic HTML <select>
const CustomSelectDropdown: React.FC<{
  value: string;
  options: string[];
  onChange: (val: string) => void;
  placeholder?: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  isMultiSelect?: boolean;
}> = ({ value, options, onChange, placeholder = 'Select option', isOpen, onToggle, onClose, isMultiSelect = false }) => {
  const [openUpwards, setOpenUpwards] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // If space below is less than 260px and space above has more room, dropup!
      setOpenUpwards(spaceBelow < 260 && spaceAbove > spaceBelow);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const selectedItems = useMemo(() => {
    if (!value || value === 'All') return [];
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }, [value]);

  const allOptions = ['All', ...options.filter((o) => o !== 'All')];
  const filtered = allOptions.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const displayLabel = useMemo(() => {
    if (!isMultiSelect) return value || 'All';
    if (selectedItems.length === 0) return 'All';
    if (selectedItems.length === 1) return selectedItems[0];
    return `${selectedItems.length} Selected (${selectedItems.slice(0, 2).join(', ')}${selectedItems.length > 2 ? '...' : ''})`;
  }, [isMultiSelect, selectedItems, value]);

  const handleSelectOption = (opt: string) => {
    if (!isMultiSelect) {
      onChange(opt);
      onClose();
      return;
    }

    if (opt === 'All') {
      onChange('All');
      return;
    }

    let newSelected: string[];
    if (selectedItems.includes(opt)) {
      newSelected = selectedItems.filter((i: string) => i !== opt);
    } else {
      newSelected = [...selectedItems, opt];
    }

    if (newSelected.length === 0) {
      onChange('All');
    } else {
      onChange(newSelected.join(', '));
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        title={isMultiSelect && selectedItems.length > 0 ? selectedItems.join(', ') : undefined}
        className="w-full bg-white hover:bg-slate-50/80 border border-gray-300/90 rounded-xl px-3.5 sm:px-4 py-2 sm:py-2.5 2xl:py-3 text-xs sm:text-sm 2xl:text-base font-semibold text-gray-900 flex items-center justify-between shadow-sm focus:outline-none focus:ring-2 focus:ring-[#002B9A] transition cursor-pointer"
      >
        <span className="truncate">{displayLabel}</span>
        <HiOutlineChevronDown
          className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-500 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#002B9A]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 w-full bg-white rounded-xl border border-gray-200/90 shadow-[0_16px_40px_rgba(0,43,154,0.18)] p-2 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1.5 ${
            openUpwards ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top'
          }`}
        >
          {allOptions.length > 6 && (
            <div className="relative mb-1">
              <HiOutlineMagnifyingGlass className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-slate-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#002B9A]"
                autoFocus
              />
            </div>
          )}

          <div className="max-h-48 sm:max-h-52 2xl:max-h-64 overflow-y-auto space-y-0.5 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="p-2 text-center text-xs sm:text-sm font-medium text-gray-400">
                No options found
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = isMultiSelect
                  ? (opt === 'All' ? selectedItems.length === 0 : selectedItems.includes(opt))
                  : (value === opt || (!value && opt === 'All'));

                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`w-full text-left px-3.5 py-1.5 sm:py-2 2xl:py-2.5 text-xs sm:text-sm 2xl:text-base font-semibold rounded-lg transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-[#002B9A] font-bold'
                        : 'text-gray-700 hover:bg-slate-100/80 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      {isMultiSelect && opt !== 'All' && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-4 h-4 rounded text-[#002B9A] border-gray-300 focus:ring-[#002B9A] pointer-events-none"
                        />
                      )}
                      <span className="truncate">{opt}</span>
                    </div>
                    {isSelected && <HiOutlineCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#002B9A] shrink-0 ml-1" />}
                  </button>
                );
              })
            )}
          </div>

          {isMultiSelect && (
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => onChange('All')}
                className="text-xs text-gray-500 hover:text-red-600 font-bold transition cursor-pointer"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-[#002B9A] hover:bg-[#002175] text-white text-xs font-bold px-3 py-1 rounded-lg transition shadow-sm cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialFilters = {},
  sections,
  title = 'Filter Options',
}) => {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [openSectionKey, setOpenSectionKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const defaults: Record<string, string> = {};
      sections.forEach((s) => {
        defaults[s.key] = initialFilters[s.key] || 'All';
      });
      setValues(defaults);
      setOpenSectionKey(null);
    }
  }, [isOpen, sections, initialFilters]);

  if (!isOpen || !mounted) return null;

  const handleApply = () => {
    setOpenSectionKey(null);
    onApply(values);
    onClose();
  };

  const handleReset = () => {
    setOpenSectionKey(null);
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

  return createPortal(
    /* Outer Backdrop Overlay - Zero blur on background outside modal */
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/25 z-50 overflow-y-auto p-3 sm:p-4 flex items-center justify-center cursor-pointer animate-in fade-in duration-150"
    >
      {/* Inner Modal Card - 75% Opacity Rich Frosted Glass */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto bg-white/90 backdrop-blur-2xl rounded-2xl border border-white/80 max-w-lg xl:max-w-xl 2xl:max-w-2xl w-full overflow-visible p-4 sm:p-5 2xl:p-6 space-y-3.5 sm:space-y-4 2xl:space-y-5 text-gray-900 animate-in zoom-in-95 duration-150 cursor-default shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 2xl:pb-3.5 border-b border-gray-200/60">
          <div className="flex items-center gap-2 font-bold text-base sm:text-lg 2xl:text-xl text-[#002B9A]">
            <HiOutlineAdjustmentsHorizontal className="w-5 h-5 sm:w-6 sm:h-6 text-[#0066B1]" />
            <span>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1.5 rounded-lg transition cursor-pointer"
            aria-label="Close filter modal"
          >
            <HiOutlineXMark className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Dynamic Filter Sections */}
        <div className="space-y-3 sm:space-y-3.5 2xl:space-y-4">
          {sections.map((section) => (
            <div
              key={section.key}
              className={`relative ${openSectionKey === section.key ? 'z-30' : 'z-10'}`}
            >
              <label className="block text-gray-500 uppercase tracking-wider text-[11px] sm:text-xs 2xl:text-sm font-bold mb-1 sm:mb-1.5">
                {section.label}
              </label>

              {section.type === 'buttons' ? (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {['All', ...section.options].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateValue(section.key, opt)}
                      className={`py-1.5 sm:py-2 2xl:py-2.5 px-3 sm:px-4 2xl:px-5 rounded-xl font-semibold transition border text-xs sm:text-sm 2xl:text-base cursor-pointer ${
                        values[section.key] === opt
                          ? 'bg-[#002B9A] text-white border-[#002B9A] shadow-[0_2px_8px_rgba(0,43,154,0.3)] font-bold'
                          : 'bg-white hover:bg-slate-100/80 text-gray-700 border-gray-200/90 shadow-sm'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <CustomSelectDropdown
                  value={values[section.key] || 'All'}
                  options={section.options}
                  onChange={(val) => updateValue(section.key, val)}
                  isOpen={openSectionKey === section.key}
                  onToggle={() =>
                    setOpenSectionKey((prev) => (prev === section.key ? null : section.key))
                  }
                  onClose={() => setOpenSectionKey(null)}
                  isMultiSelect={section.isMultiSelect}
                />
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="pt-2.5 sm:pt-3 2xl:pt-3.5 border-t border-gray-200/60 flex items-center justify-between gap-3 relative z-10">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 sm:px-5 2xl:px-6 py-2 sm:py-2.5 2xl:py-3 bg-white hover:bg-slate-100/80 text-gray-700 font-bold text-xs sm:text-sm 2xl:text-base rounded-xl transition flex items-center gap-1.5 border border-gray-200/80 shadow-sm cursor-pointer"
          >
            <HiOutlineArrowPath className="w-4 h-4 2xl:w-5 2xl:h-5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 sm:px-6 2xl:px-7 py-2 sm:py-2.5 2xl:py-3 bg-[#002B9A] hover:bg-[#002175] text-white font-bold text-xs sm:text-sm 2xl:text-base rounded-xl transition border border-[#002175] shadow-[0_2px_8px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};


