'use client';

import React from 'react';
import {
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineArrowsPointingOut,
  HiOutlineLightBulb,
} from 'react-icons/hi2';
import { SecurityReport } from '@/lib/types';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

interface ReportDetailDrawerProps {
  report: SecurityReport | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullSummary?: (report: SecurityReport) => void;
}

function truncateSummary(text?: string, maxLength: number = 220): string {
  if (!text) return 'No summary provided.';
  const cleanText = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '[Image]').replace(/[#*`_]/g, '');
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.substring(0, maxLength) + '...';
}

function renderSeverityBadge(sev: string) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs sm:text-sm bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]">Critical</span>;
  if (s === 'high') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs sm:text-sm bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]">High</span>;
  if (s === 'medium') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs sm:text-sm bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]">Medium</span>;
  if (s === 'low') return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs sm:text-sm bg-blue-100 text-blue-800 border border-blue-300">Low</span>;
  return <span className="inline-block px-2.5 py-0.5 rounded-md font-bold text-xs sm:text-sm bg-slate-100 text-slate-800 border border-slate-300">Info</span>;
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
  const recommendedActionText = report.recommendedAction || report.recommended_action || '';

  return (
    <>
      {/* Mobile Backdrop (< lg) */}
      <div
        onClick={onClose}
        className="lg:hidden fixed inset-0 bg-slate-950/30 backdrop-blur-sm z-40 animate-in fade-in duration-150 cursor-pointer"
      />

      {/* Slide-out Drawer Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 lg:z-30 lg:inset-auto lg:top-[84px] lg:bottom-3.5 lg:right-6 w-full max-w-full sm:max-w-md lg:max-w-none lg:w-[390px] xl:w-[430px] 2xl:w-[480px] bg-white/90 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-none lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200/60 px-4 sm:px-5 xl:px-6 py-3.5 xl:py-4 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h3 className="text-base sm:text-lg xl:text-xl font-bold text-gray-900 tracking-tight">Report Details</h3>
          <button
            onClick={onClose}
            className="text-gray-700 font-bold hover:text-gray-900 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
            aria-label="Close details panel"
          >
            <HiOutlineXMark className="w-5 h-5 xl:w-6 xl:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 xl:p-6 space-y-4 xl:space-y-5 text-gray-900">
          <div className="bg-white/80 backdrop-blur-sm p-3.5 xl:p-4 rounded-xl border border-gray-200/80 shadow-sm">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1">Report Name</p>
            <p className="text-base sm:text-lg font-black text-[#002B9A] break-words">{report.reportName}</p>
          </div>

          {/* Report UUID */}
          <div>
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1">Report UUID</p>
            <p className="font-mono text-xs sm:text-xs xl:text-sm text-gray-700 bg-white/80 backdrop-blur-sm p-2.5 rounded-xl border border-gray-200/80 break-all font-medium">
              {uuidDisplay}
            </p>
          </div>

          {/* Severity & SOC ID */}
          <div className="grid grid-cols-2 gap-3 pt-3 xl:pt-4 border-t border-gray-200/80 text-xs xl:text-sm">
            <div>
              <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1">Severity</p>
              {renderSeverityBadge(report.severity)}
            </div>
            <div>
              <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1">SOC ID</p>
              <p className="font-bold text-gray-900 mt-0.5">{socIdDisplay}</p>
            </div>
          </div>

          {/* Date Generated */}
          <div className="pt-3 xl:pt-4 border-t border-gray-200/80 text-xs xl:text-sm">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-0.5">Date Generated</p>
            <p className="font-semibold text-gray-800">{report.dateGenerated}</p>
          </div>

          {/* Summary Section */}
          <div className="pt-3 xl:pt-4 border-t border-gray-200/80">
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="font-bold text-xs xl:text-sm text-gray-900 uppercase tracking-wider">Summary</h4>
            </div>
            <div className="bg-blue-50/70 p-3.5 xl:p-4 rounded-xl border border-blue-100 max-h-64 overflow-y-auto">
              <p className="text-xs sm:text-sm xl:text-base text-gray-700 font-normal leading-relaxed">
                {truncateSummary(report.summary, 220)}
              </p>
            </div>
          </div>

          {/* Recommended Action Section (Under Summary) */}
          {recommendedActionText && (
            <div className="pt-3 xl:pt-4 border-t border-gray-200/80">
              <h4 className="font-bold text-xs xl:text-sm text-emerald-900 uppercase tracking-wider mb-1.5">Recommended Action</h4>
              <div className="bg-emerald-50/70 p-3.5 xl:p-4 rounded-xl border border-emerald-200 max-h-56 overflow-y-auto">
                <p className="text-xs sm:text-sm xl:text-base text-emerald-900 font-normal leading-relaxed">
                  {truncateSummary(recommendedActionText, 220)}
                </p>
              </div>
            </div>
          )}

          {/* Affected Devices */}
          {report.affectedDevices && report.affectedDevices.length > 0 && (
            <div className="pt-3 xl:pt-4 border-t border-gray-200/80">
              <h4 className="font-bold text-xs xl:text-sm text-gray-900 uppercase tracking-wider mb-1.5">
                Affected Devices ({report.affectedDevices.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {report.affectedDevices.map((dev, idx) => (
                  <div key={idx} className="bg-white/80 backdrop-blur-sm p-2.5 rounded-xl border border-gray-200/80 text-xs sm:text-sm">
                    <p className="font-bold text-[#002B9A]">{dev.agent || dev.hostname}</p>
                    {dev.ip && <p className="text-xs text-gray-500 font-mono font-medium">{dev.ip}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Button to Open Full Modal */}
        <div className="border-t border-gray-200/60 p-4 xl:p-5 bg-white/90 backdrop-blur-md flex-shrink-0">
          <button
            onClick={() => onOpenFullSummary && onOpenFullSummary(report)}
            className="w-full bg-[#002B9A] text-white py-2.5 sm:py-3 xl:py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm xl:text-base 2xl:text-lg hover:bg-[#002175] transition flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            <HiOutlineArrowsPointingOut className="w-4 h-4 sm:w-5 sm:h-5 text-blue-300" />
            <span>Read Full Report</span>
          </button>
        </div>
      </div>
    </>
  );
};
