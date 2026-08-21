'use client';

import React from 'react';
import { SecurityReport } from '@/lib/mock-data';
import { HiOutlineXMark, HiOutlineDocumentText, HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';

interface ReportDetailDrawerProps {
  report: SecurityReport | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullSummary?: (report: SecurityReport) => void;
}

function truncateSummary(text: string, maxLength: number = 180): string {
  if (!text) return 'No summary provided.';
  const cleanText = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '[Image]').replace(/[#*`_]/g, '');
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.substring(0, maxLength) + '...';
}

function renderSeverityBadge(sev: string) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-red-100 text-red-800 border border-red-300">Critical</span>;
  if (s === 'high') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-orange-100 text-orange-800 border border-orange-300">High</span>;
  if (s === 'medium') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-amber-100 text-amber-800 border border-amber-300">Medium</span>;
  if (s === 'low') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-blue-100 text-blue-800 border border-blue-300">Low</span>;
  return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300">Info</span>;
}

export const ReportDetailDrawer: React.FC<ReportDetailDrawerProps> = ({
  report,
  isOpen,
  onClose,
  onOpenFullSummary,
}) => {
  if (!isOpen || !report) return null;

  const socIdDisplay = report.soc_id || 'N/A';
  const uuidDisplay = report.report_uuid || report.id;
  const isLongSummary = (report.summary || '').length > 150;

  return (
    <>
      {/* Mobile Backdrop (< lg) */}
      <div
        onClick={onClose}
        className="lg:hidden fixed inset-0 bg-slate-950/30 backdrop-blur-sm z-40 animate-in fade-in duration-150 cursor-pointer"
      />

      {/* Detail Panel Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 lg:z-0 lg:relative lg:inset-auto h-full w-[85vw] max-w-sm lg:w-[380px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col flex-shrink-0 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#002B9A] px-4 py-3 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h3 className="text-lg font-black text-gray-900 tracking-tight">Report Details</h3>
          <button
            onClick={onClose}
            className="text-gray-900 font-bold hover:text-gray-600 p-1 rounded-md transition"
            aria-label="Close report details"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-gray-900">
          {/* Report Name */}
          <div>
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Report Name</p>
            <p className="text-sm font-black text-[#002B9A]">{report.reportName}</p>
          </div>

          {/* Report UUID (placed right after Report Name) */}
          <div className="pt-2">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Report UUID</p>
            <p className="font-mono text-[11px] text-gray-700 bg-white/70 backdrop-blur-sm p-2 rounded-md border border-gray-200 break-all font-semibold">
              {uuidDisplay}
            </p>
          </div>

          {/* Severity & SOC ID */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 text-xs">
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Severity</p>
              {renderSeverityBadge(report.severity)}
            </div>
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">SOC ID</p>
              <p className="font-black text-gray-900 mt-0.5">{socIdDisplay}</p>
            </div>
          </div>

          {/* Date Generated */}
          <div className="pt-3 border-t border-gray-200 text-xs">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Date Generated</p>
            <p className="font-bold text-gray-800">{report.dateGenerated}</p>
          </div>

          {/* Summary Preview Section */}
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider">Summary Preview</h4>
              {onOpenFullSummary && (
                <button
                  onClick={() => onOpenFullSummary(report)}
                  className="text-[11px] font-extrabold text-[#002B9A] hover:text-[#0066B1] flex items-center gap-1"
                >
                  <span>Expand</span>
                  <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div
              onClick={() => onOpenFullSummary && onOpenFullSummary(report)}
              className="group cursor-pointer bg-blue-50/70 hover:bg-blue-100/80 p-3 rounded-md border border-blue-200 transition relative"
            >
              <p className="text-xs text-gray-800 font-medium leading-relaxed">
                {truncateSummary(report.summary, 160)}
              </p>

              {isLongSummary && (
                <div className="mt-2 pt-2 border-t border-blue-200/80 flex items-center justify-between text-[#002B9A] font-extrabold text-xs group-hover:text-[#002175]">
                  <span className="flex items-center gap-1.5">
                    <HiOutlineDocumentText className="w-4 h-4 text-blue-600" />
                    Read Full Summary
                  </span>
                  <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          </div>

          {/* Recommended Action */}
          <div className="pt-3 border-t border-gray-200">
            <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">Recommended Action</h4>
            <p className="text-xs font-bold text-gray-800 bg-amber-50/70 p-2.5 rounded-md border border-amber-200 leading-relaxed">
              {report.recommendedAction || 'No specific recommended action.'}
            </p>
          </div>
        </div>

        {/* Action Button to Open Full Modal */}
        <div className="p-3.5 border-t border-gray-200 flex-shrink-0 bg-white/70 backdrop-blur-sm">
          <button
            onClick={() => onOpenFullSummary && onOpenFullSummary(report)}
            className="w-full bg-[#002B9A] hover:bg-[#002175] text-white font-extrabold py-2.5 rounded-md text-sm transition flex items-center justify-center gap-2 border border-[#002175]"
          >
            <HiOutlineDocumentText className="w-4 h-4 text-blue-300" />
            <span>View Full Report Summary</span>
          </button>
        </div>
      </div>
    </>
  );
};
