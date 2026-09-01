'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineXMark,
  HiOutlineCalendar,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi2';

export interface CustomDateRange {
  startDate: string; // Format: YYYY-MM-DD
  endDate: string;   // Format: YYYY-MM-DD
}

interface CustomDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRange?: CustomDateRange | null;
  onApply: (range: CustomDateRange) => void;
}

const MONTHS_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CustomDateModal: React.FC<CustomDateModalProps> = ({
  isOpen,
  onClose,
  initialRange,
  onApply,
}) => {
  const [mounted, setMounted] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Month and Year state for embedded calendar
  const [viewMonth, setViewMonth] = useState<number>(new Date().getMonth());
  const [viewYear, setViewYear] = useState<number>(new Date().getFullYear());

  // Helper to format Date object to YYYY-MM-DD string
  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      if (initialRange && initialRange.startDate && initialRange.endDate) {
        setStartDate(initialRange.startDate);
        setEndDate(initialRange.endDate);
        const [y, m] = initialRange.startDate.split('-').map(Number);
        if (y && m) {
          setViewYear(y);
          setViewMonth(m - 1);
        }
      } else {
        // Default to last 7 days
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
        setStartDate(formatDateString(sevenDaysAgo));
        setEndDate(formatDateString(today));
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
      }
      setErrorMessage(null);
    }
  }, [isOpen, initialRange]);

  if (!isOpen || !mounted) return null;

  const handleApply = () => {
    if (!startDate || !endDate) {
      setErrorMessage('Please select a start date and an end date.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setErrorMessage('Start date cannot be after end date.');
      return;
    }

    setErrorMessage(null);
    onApply({ startDate, endDate });
    onClose();
  };

  // Preset Handlers
  const applyPreset = (preset: 'today' | '7days' | '14days' | '30days' | 'thisMonth') => {
    const today = new Date();
    let start = new Date();

    if (preset === 'today') {
      start = today;
    } else if (preset === '7days') {
      start = new Date(today);
      start.setDate(today.getDate() - 6);
    } else if (preset === '14days') {
      start = new Date(today);
      start.setDate(today.getDate() - 13);
    } else if (preset === '30days') {
      start = new Date(today);
      start.setDate(today.getDate() - 29);
    } else if (preset === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    const sStr = formatDateString(start);
    const eStr = formatDateString(today);
    setStartDate(sStr);
    setEndDate(eStr);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setErrorMessage(null);
  };

  // Calendar Grid Generator
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun

  const daysGrid: { day: number; currentMonth: boolean; dateStr: string }[] = [];

  // Fill previous month days
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const pMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const pYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateStr = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    daysGrid.push({ day, currentMonth: false, dateStr });
  }

  // Fill current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    daysGrid.push({ day, currentMonth: true, dateStr });
  }

  // Fill next month days to complete 35 or 42 grid cells
  const totalCells = daysGrid.length > 35 ? 42 : 35;
  const remaining = totalCells - daysGrid.length;
  for (let day = 1; day <= remaining; day++) {
    const nMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateStr = `${nYear}-${String(nMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    daysGrid.push({ day, currentMonth: false, dateStr });
  }

  const handleDateClick = (dateStr: string) => {
    if (!startDate || (startDate && endDate && startDate !== endDate)) {
      // Start a new single date selection
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else if (startDate && (!endDate || startDate === endDate)) {
      if (dateStr < startDate) {
        setStartDate(dateStr);
        setEndDate(startDate);
      } else {
        setEndDate(dateStr);
      }
    }
    setErrorMessage(null);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${parseInt(d, 10)} ${MONTHS_LIST[parseInt(m, 10) - 1]} ${y}`;
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/90 backdrop-blur-2xl rounded-2xl border border-white/80 max-w-lg xl:max-w-xl 2xl:max-w-2xl w-full overflow-hidden p-5 sm:p-6 2xl:p-7 space-y-4.5 sm:space-y-5 2xl:space-y-6 animate-in zoom-in-95 duration-150 cursor-default shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 2xl:pb-4 border-b border-gray-200/60">
          <div className="flex items-center gap-2 text-[#002B9A] font-bold text-base sm:text-lg 2xl:text-xl">
            <HiOutlineCalendar className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-7 2xl:h-7 text-[#0066B1]" />
            <span>Select Date Range</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1.5 rounded-lg transition cursor-pointer"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Quick Presets */}
        <div>
          <label className="block text-[11px] sm:text-xs 2xl:text-sm font-bold text-gray-500 uppercase tracking-wider mb-1.5 sm:mb-2">
            Quick Presets:
          </label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2 2xl:gap-2.5">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="px-3 sm:px-4 2xl:px-5 py-1.5 sm:py-2 text-xs sm:text-sm 2xl:text-base font-semibold bg-white/80 text-gray-700 hover:bg-[#002B9A] hover:text-white rounded-xl transition border border-gray-200 cursor-pointer shadow-sm"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('7days')}
              className="px-3 sm:px-4 2xl:px-5 py-1.5 sm:py-2 text-xs sm:text-sm 2xl:text-base font-semibold bg-white/80 text-gray-700 hover:bg-[#002B9A] hover:text-white rounded-xl transition border border-gray-200 cursor-pointer shadow-sm"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('30days')}
              className="px-3 sm:px-4 2xl:px-5 py-1.5 sm:py-2 text-xs sm:text-sm 2xl:text-base font-semibold bg-white/80 text-gray-700 hover:bg-[#002B9A] hover:text-white rounded-xl transition border border-gray-200 cursor-pointer shadow-sm"
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('thisMonth')}
              className="px-3 sm:px-4 2xl:px-5 py-1.5 sm:py-2 text-xs sm:text-sm 2xl:text-base font-semibold bg-white/80 text-gray-700 hover:bg-[#002B9A] hover:text-white rounded-xl transition border border-gray-200 cursor-pointer shadow-sm"
            >
              This Month
            </button>
          </div>
        </div>

        {/* Embedded Interactive Calendar */}
        <div className="bg-white/70 backdrop-blur-sm border border-gray-200 rounded-2xl p-4 sm:p-5 2xl:p-6">
          {/* Calendar Month/Year Controls */}
          <div className="flex items-center justify-between mb-3.5 2xl:mb-4 px-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 rounded-xl text-gray-600 hover:bg-gray-200 transition cursor-pointer"
              title="Previous Month"
            >
              <HiOutlineChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6" />
            </button>

            <span className="text-sm sm:text-base 2xl:text-lg font-bold text-[#002B9A]">
              {MONTHS_LIST[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-2 rounded-xl text-gray-600 hover:bg-gray-200 transition cursor-pointer"
              title="Next Month"
            >
              <HiOutlineChevronRight className="w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6" />
            </button>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 text-center text-[11px] sm:text-xs 2xl:text-sm font-bold text-gray-500 mb-2">
            {DAYS_HEADER.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 2xl:gap-2 text-center">
            {daysGrid.map((item, idx) => {
              const isStart = item.dateStr === startDate;
              const isEnd = item.dateStr === endDate;
              const isInRange =
                startDate &&
                endDate &&
                item.dateStr >= startDate &&
                item.dateStr <= endDate;

              let btnClass = 'text-gray-700 hover:bg-blue-100 hover:text-blue-900';

              if (!item.currentMonth) {
                btnClass = 'text-gray-300 hover:bg-gray-100';
              }

              if (isStart || isEnd) {
                btnClass = 'bg-[#002B9A] text-white font-bold hover:bg-[#002175] shadow-sm';
              } else if (isInRange) {
                btnClass = 'bg-blue-100 text-[#002B9A] font-semibold';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateClick(item.dateStr)}
                  className={`h-9 sm:h-10 2xl:h-12 w-full rounded-xl text-xs sm:text-sm 2xl:text-base font-semibold flex items-center justify-center transition cursor-pointer ${btnClass}`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Range Selected Indicator */}
        <div className="bg-blue-50/80 p-3 sm:p-3.5 2xl:p-4 rounded-xl border border-blue-100 text-xs sm:text-sm 2xl:text-base flex items-center justify-between text-gray-900">
          <span className="font-medium text-gray-600">Selected Range:</span>
          <span className="font-bold text-[#002B9A]">
            {startDate === endDate
              ? formatDisplayDate(startDate)
              : `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`}
          </span>
        </div>

        {/* Validation Warning */}
        {errorMessage && (
          <p className="text-xs sm:text-sm 2xl:text-base font-semibold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
            {errorMessage}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 2xl:gap-3 pt-2 2xl:pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 sm:px-5 2xl:px-6 py-2 sm:py-2.5 2xl:py-3 text-xs sm:text-sm 2xl:text-base font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition border border-gray-200 cursor-pointer shadow-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 sm:px-6 2xl:px-7 py-2 sm:py-2.5 2xl:py-3 text-xs sm:text-sm 2xl:text-base font-bold bg-[#002B9A] text-white hover:bg-[#002175] rounded-xl transition border border-[#002175] shadow-[0_2px_8px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            Apply Filter
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
