'use client';

import React, { useState, useEffect } from 'react';
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
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAYS_HEADER = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const CustomDateModal: React.FC<CustomDateModalProps> = ({
  isOpen,
  onClose,
  initialRange,
  onApply,
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  if (!isOpen) return null;

  const handleApply = () => {
    if (!startDate || !endDate) {
      setErrorMessage('Pilih tanggal mulai dan tanggal selesai.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setErrorMessage('Tanggal mulai tidak boleh lebih besar dari tanggal selesai.');
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

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 backdrop-blur-xs">
      <div className="bg-white rounded-xl border border-gray-200 max-w-md w-full overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-navy-800 font-extrabold text-base">
            <HiOutlineCalendar className="w-5 h-5 text-blue-700" />
            <span>Pilih Rentang Tanggal</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1 rounded-lg transition"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Presets */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
            Pilihan Cepat:
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="px-2.5 py-1 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-navy-800 hover:text-white rounded-md transition border border-gray-200 shadow-xs"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => applyPreset('7days')}
              className="px-2.5 py-1 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-navy-800 hover:text-white rounded-md transition border border-gray-200 shadow-xs"
            >
              7 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => applyPreset('30days')}
              className="px-2.5 py-1 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-navy-800 hover:text-white rounded-md transition border border-gray-200 shadow-xs"
            >
              30 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => applyPreset('thisMonth')}
              className="px-2.5 py-1 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-navy-800 hover:text-white rounded-md transition border border-gray-200 shadow-xs"
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* Embedded Interactive Calendar */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          {/* Calendar Month/Year Controls */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md text-gray-600 hover:bg-gray-200 transition"
              title="Bulan Sebelumnya"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm font-extrabold text-navy-800">
              {MONTHS_LIST[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md text-gray-600 hover:bg-gray-200 transition"
              title="Bulan Berikutnya"
            >
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-gray-500 mb-1">
            {DAYS_HEADER.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
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
                btnClass = 'bg-navy-800 text-white font-bold shadow-xs hover:bg-navy-900';
              } else if (isInRange) {
                btnClass = 'bg-blue-100 text-navy-900 font-semibold';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateClick(item.dateStr)}
                  className={`h-8 w-full rounded-md text-xs font-semibold flex items-center justify-center transition ${btnClass}`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Range Selected Indicator */}
        <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-100 text-xs flex items-center justify-between text-navy-900">
          <span className="font-medium text-gray-600">Rentang Terpilih:</span>
          <span className="font-extrabold text-navy-800">
            {startDate === endDate
              ? formatDisplayDate(startDate)
              : `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`}
          </span>
        </div>

        {/* Validation Warning */}
        {errorMessage && (
          <p className="text-xs font-bold text-red-600 bg-red-50 p-2 rounded-md border border-red-200">
            {errorMessage}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-md transition border border-gray-200"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 text-xs font-extrabold bg-navy-800 text-white hover:bg-navy-900 rounded-md shadow-sm transition"
          >
            Terapkan Filter
          </button>
        </div>
      </div>
    </div>
  );
};
