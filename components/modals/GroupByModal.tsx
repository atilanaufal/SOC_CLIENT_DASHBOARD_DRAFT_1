'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineXMark,
  HiOutlineRectangleGroup,
  HiOutlineQueueList,
  HiOutlineCheck,
} from 'react-icons/hi2';

export type GroupByMode = 'alerts' | 'incidents';

interface GroupByModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: GroupByMode;
  onSelectMode: (mode: GroupByMode) => void;
}

export const GroupByModal: React.FC<GroupByModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  onSelectMode,
}) => {
  const [selectedMode, setSelectedMode] = useState<GroupByMode>(currentMode);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedMode(currentMode);
    }
  }, [isOpen, currentMode]);

  if (!isOpen || !mounted) return null;

  const handleApply = () => {
    onSelectMode(selectedMode);
    onClose();
  };

  return createPortal(
    /* Outer Backdrop Overlay - Matches FilterModal */
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
    >
      {/* Inner Modal Card - Matches FilterModal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/90 backdrop-blur-2xl rounded-2xl border border-white/80 max-w-lg w-full overflow-visible p-5 sm:p-6 space-y-4 sm:space-y-5 text-gray-900 animate-in zoom-in-95 duration-150 cursor-default shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)]"
      >
        {/* Header - Matches FilterModal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200/60">
          <div className="flex items-center gap-2 font-bold text-base sm:text-lg text-[#002B9A]">
            <HiOutlineRectangleGroup className="w-5 h-5 sm:w-6 sm:h-6 text-[#0066B1]" />
            <span>Group By</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1.5 rounded-lg transition cursor-pointer"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Options Body - Preserving the cards */}
        <div className="space-y-3">
          {/* Option 1: Alerts (Pure Events) */}
          <div
            onClick={() => setSelectedMode('alerts')}
            className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
              selectedMode === 'alerts'
                ? 'border-[#002B9A] bg-blue-50/70 shadow-[0_4px_14px_rgba(0,43,154,0.12)]'
                : 'border-gray-200/80 bg-white hover:border-gray-300 hover:bg-slate-50/60'
            }`}
          >
            <div
              className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                selectedMode === 'alerts' ? 'bg-[#002B9A] text-white' : 'bg-slate-100 text-gray-600'
              }`}
            >
              <HiOutlineQueueList className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-gray-900">Alerts</h4>
                {selectedMode === 'alerts' && (
                  <span className="w-5 h-5 rounded-full bg-[#002B9A] text-white flex items-center justify-center flex-shrink-0">
                    <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 font-medium leading-relaxed mt-1">
                Displays pure individual alert events directly.
              </p>
            </div>
          </div>

          {/* Option 2: Incidents (Grouped) */}
          <div
            onClick={() => setSelectedMode('incidents')}
            className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
              selectedMode === 'incidents'
                ? 'border-[#002B9A] bg-blue-50/70 shadow-[0_4px_14px_rgba(0,43,154,0.12)]'
                : 'border-gray-200/80 bg-white hover:border-gray-300 hover:bg-slate-50/60'
            }`}
          >
            <div
              className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                selectedMode === 'incidents' ? 'bg-[#002B9A] text-white' : 'bg-slate-100 text-gray-600'
              }`}
            >
              <HiOutlineRectangleGroup className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-gray-900">Incidents (Grouped)</h4>
                {selectedMode === 'incidents' && (
                  <span className="w-5 h-5 rounded-full bg-[#002B9A] text-white flex items-center justify-center flex-shrink-0">
                    <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 font-medium leading-relaxed mt-1">
                Groups alerts by <strong>(rule_id, agent_id, ip_source, date)</strong>. Displays total detection count and last observed timestamp.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons - Matches FilterModal Footer */}
        <div className="pt-3 border-t border-gray-200/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-slate-100/80 text-gray-700 font-bold text-xs sm:text-sm rounded-xl transition border border-gray-200/80 shadow-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 sm:px-6 py-2 sm:py-2.5 bg-[#002B9A] hover:bg-[#002175] text-white font-bold text-xs sm:text-sm rounded-xl transition border border-[#002175] shadow-[0_2px_8px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
