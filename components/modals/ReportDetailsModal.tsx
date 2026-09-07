'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineServerStack,
  HiOutlineShieldExclamation,
  HiOutlineLightBulb,
} from 'react-icons/hi2';
import { SecurityReport } from '@/lib/types';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

interface ReportDetailsModalProps {
  report: SecurityReport | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReportDetailsModal: React.FC<ReportDetailsModalProps> = ({
  report,
  isOpen,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !report) return null;

  const socIdDisplay = report.soc_id || 'N/A';
  const uuidDisplay = report.report_uuid || report.id;
  const recommendedActionText = report.recommendedAction || report.recommended_action || '';

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/25 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      {/* Large Modal Container (max-w-4xl) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/85 backdrop-blur-2xl rounded-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-white/80 shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)] cursor-default"
      >
        {/* Header */}
        <div className="bg-[#002B9A]/95 backdrop-blur-md text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <HiOutlineDocumentText className="w-6 h-6 text-blue-300 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">{report.reportName}</h3>
              <p className="text-xs text-blue-200 font-medium truncate">SOC ID: {socIdDisplay} | UUID: {uuidDisplay.substring(0, 18)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 font-bold p-1.5 rounded-lg transition cursor-pointer flex-shrink-0"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Info Toolbar */}
        <div className="bg-slate-100/80 backdrop-blur-md border-b border-gray-200/60 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 text-xs font-semibold text-gray-700 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-medium">Severity:</span>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${
                  report.severity === 'Critical'
                    ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                    : report.severity === 'High'
                    ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                    : report.severity === 'Medium'
                    ? 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                    : report.severity === 'Low'
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-slate-100 text-slate-800 border border-slate-300'
                }`}
              >
                {report.severity}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-medium">Generated:</span>
              <span className="text-gray-900 font-bold">{report.dateGenerated}</span>
            </div>
          </div>

          <div className="text-gray-500 text-xs">
            <span>Synced: {report.synced_at ? report.synced_at.split('T')[0] : report.lastUpdated}</span>
          </div>
        </div>

        {/* Content Area with Vertical Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-6 text-gray-900 bg-[#edf2f7]">
          {/* Summary Section with Markdown Renderer */}
          <section className="bg-white/80 backdrop-blur-xl p-4 sm:p-5 rounded-xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
              <HiOutlineShieldExclamation className="w-5 h-5 text-[#002B9A]" />
              <h4 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">Summary</h4>
            </div>
            <MarkdownRenderer content={report.summary || 'No detailed summary available.'} />
          </section>

          {/* Recommended Action Section */}
          {recommendedActionText && (
            <section className="bg-white/80 backdrop-blur-xl p-4 sm:p-5 rounded-xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
              <div className="mb-3 pb-2 border-b border-emerald-200">
                <h4 className="text-xs sm:text-sm font-bold text-emerald-900 uppercase tracking-wider">Recommended Action</h4>
              </div>
              <MarkdownRenderer content={recommendedActionText} />
            </section>
          )}

          {/* Affected Devices List */}
          {report.affectedDevices && report.affectedDevices.length > 0 && (
            <section className="bg-white/80 backdrop-blur-xl p-4 sm:p-5 rounded-xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                <HiOutlineServerStack className="w-5 h-5 text-[#002B9A]" />
                <h4 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Impacted Assets ({report.affectedDevices.length})
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                {report.affectedDevices.map((dev, idx) => (
                  <div key={idx} className="p-3 bg-white/70 backdrop-blur-sm rounded-lg border border-gray-200 text-xs">
                    <p className="font-bold text-[#002B9A] text-sm">{dev.agent || dev.hostname}</p>
                    {dev.ip && <p className="text-gray-600 font-mono text-xs mt-0.5">IP: {dev.ip}</p>}
                    {dev.os && <p className="text-gray-500 text-xs mt-0.5">OS: {dev.os}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white/90 backdrop-blur-md border-t border-gray-200/60 px-6 py-3 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-[#002B9A] hover:bg-[#002175] text-white px-5 py-2 rounded-lg text-xs font-bold transition cursor-pointer shadow-[0_4px_12px_rgba(0,43,154,0.3)]"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
