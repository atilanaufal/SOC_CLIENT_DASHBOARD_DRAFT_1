'use client';

import React, { useState, useEffect, useRef } from 'react';
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
}> = ({ value, options, onChange, placeholder = 'Select option' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allOptions = ['All', ...options.filter((o) => o !== 'All')];
  const filtered = allOptions.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white hover:bg-slate-50/80 border border-gray-300/90 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-900 flex items-center justify-between shadow-sm focus:outline-none focus:ring-2 focus:ring-[#002B9A] transition"
      >
        <span className="truncate">{value || 'All'}</span>
        <HiOutlineChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#002B9A]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full bg-white rounded-xl border border-gray-200/90 shadow-[0_16px_40px_rgba(0,43,154,0.18)] p-2 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1.5">
          {allOptions.length > 6 && (
            <div className="relative mb-1">
              <HiOutlineMagnifyingGlass className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-slate-50 border border-gray-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#002B9A]"
                autoFocus
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-0.5 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="p-2 text-center text-xs font-semibold text-gray-400">
                No options found
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = value === opt || (!value && opt === 'All');
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-50 text-[#002B9A] font-black'
                        : 'text-gray-700 hover:bg-slate-100/80 hover:text-gray-900'
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && <HiOutlineCheck className="w-4 h-4 text-[#002B9A] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
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
    }
  }, [isOpen, sections, initialFilters]);

  if (!isOpen || !mounted) return null;

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

  return createPortal(
    /* Outer Backdrop Overlay - Zero blur on background outside modal */
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
    >
      {/* Inner Modal Card - 75% Opacity Rich Frosted Glass */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/85 backdrop-blur-2xl rounded-2xl border border-white/80 max-w-lg w-full overflow-visible p-5 space-y-4 text-gray-900 animate-in zoom-in-95 duration-150 cursor-default shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200/60">
          <div className="flex items-center gap-2 font-black text-base text-[#002B9A]">
            <HiOutlineAdjustmentsHorizontal className="w-5 h-5 text-[#0066B1]" />
            <span>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1 rounded-md transition cursor-pointer"
            aria-label="Close filter modal"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Filter Sections */}
        <div className="space-y-4 text-sm font-bold">
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
                      className={`py-1.5 px-3 rounded-lg font-bold transition border text-xs cursor-pointer ${
                        values[section.key] === opt
                          ? 'bg-[#002B9A] text-white border-[#002B9A] shadow-[0_2px_8px_rgba(0,43,154,0.3)] font-black'
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
                />
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-gray-200/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-white hover:bg-slate-100/80 text-gray-700 font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 border border-gray-200/80 shadow-sm cursor-pointer"
          >
            <HiOutlineArrowPath className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 bg-[#002B9A] hover:bg-[#002175] text-white font-extrabold text-xs rounded-xl transition border border-[#002175] shadow-[0_2px_8px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
