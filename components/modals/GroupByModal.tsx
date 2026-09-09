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
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/95 backdrop-blur-2xl rounded-2xl max-w-md w-full flex flex-col overflow-hidden border border-white/80 shadow-[0_20px_50px_rgba(0,43,154,0.18),inset_0_1px_2px_rgba(255,255,255,0.95)] animate-in zoom-in-95 duration-150 cursor-default"
      >
        {/* Modal Header */}
        <div className="bg-[#002B9A]/95 backdrop-blur-md text-white px-5 py-3.5 flex items-center justify-between flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <div className="flex items-center gap-2">
            <HiOutlineRectangleGroup className="w-5 h-5 text-blue-300 stroke-[2.2]" />
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">Group By</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white font-bold p-1 rounded-md transition cursor-pointer hover:bg-white/10"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-3.5">
          <p className="text-xs sm:text-sm font-semibold text-gray-600 leading-relaxed">
            Select how security alerts should be presented on this page:
          </p>

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
                  Displays pure individual alert events directly from the database (1 row = 1 alert, without count or last observed).
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
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50/90 border-t border-gray-200/80 px-5 py-3.5 flex items-center justify-end gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-gray-700 hover:bg-gray-200 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs sm:text-sm font-black text-white bg-[#002B9A] hover:bg-[#002175] transition shadow-[0_2px_8px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
