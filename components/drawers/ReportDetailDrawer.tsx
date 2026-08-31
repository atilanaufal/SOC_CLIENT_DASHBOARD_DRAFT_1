'use client';

import React from 'react';
import {
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineArrowsPointingOut,
} from 'react-icons/hi2';
import { SecurityReport } from '@/lib/types';

interface ReportDetailDrawerProps {
  report: SecurityReport | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullSummary?: (report: SecurityReport) => void;
}

function truncateSummary(text?: string, maxLength: number = 180): string {
  if (!text) return 'No summary provided.';
  const cleanText = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '[Image]').replace(/[#*`_]/g, '');
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.substring(0, maxLength) + '...';
}

function renderSeverityBadge(sev: string) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]">Critical</span>;
  if (s === 'high') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]">High</span>;
  if (s === 'medium') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]">Medium</span>;
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
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 lg:z-30 lg:inset-auto lg:top-[84px] lg:bottom-3.5 lg:right-6 w-[85vw] max-w-sm lg:w-[380px] 2xl:w-[440px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200/60 px-4 2xl:px-5 py-3 2xl:py-4 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h3 className="text-lg 2xl:text-xl font-black text-gray-900 tracking-tight">Report Details</h3>
          <button
            onClick={onClose}
            className="text-gray-900 font-bold hover:text-gray-600 p-1 rounded-md transition cursor-pointer"
            aria-label="Close details panel"
          >
            <HiOutlineXMark className="w-5 h-5 2xl:w-6 2xl:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-gray-900">
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

          {/* Summary Preview */}
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider">Executive Summary</h4>
            </div>
            <p className="text-xs text-gray-700 font-medium leading-relaxed bg-blue-50/70 p-2.5 rounded-md border border-blue-100 line-clamp-4">
              {truncateSummary(report.summary, 180)}
            </p>
          </div>

          {/* Affected Devices */}
          {report.affectedDevices && report.affectedDevices.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1.5">
                Affected Devices ({report.affectedDevices.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {report.affectedDevices.map((dev, idx) => (
                  <div key={idx} className="bg-white/70 backdrop-blur-sm p-2 rounded-md border border-gray-200 text-xs">
                    <p className="font-black text-[#002B9A]">{dev.agent || dev.hostname}</p>
                    {dev.ip && <p className="text-[11px] text-gray-500 font-mono font-semibold">{dev.ip}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Button to Open Full Modal */}
        <div className="border-t border-gray-200/60 p-4 bg-white/90 backdrop-blur-md flex-shrink-0">
          <button
            onClick={() => onOpenFullSummary && onOpenFullSummary(report)}
            className="w-full bg-[#002B9A] text-white py-2.5 px-4 rounded-lg font-black text-xs hover:bg-[#002175] transition flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            <HiOutlineArrowsPointingOut className="w-4 h-4 text-blue-300" />
            <span>Read Full Executive Report</span>
          </button>
        </div>
      </div>
    </>
  );
};
