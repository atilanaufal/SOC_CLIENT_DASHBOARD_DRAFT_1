'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineServerStack,
  HiOutlineShieldExclamation,
  HiOutlineInformationCircle,
} from 'react-icons/hi2';
import { SecurityReport } from '@/lib/types';

interface ReportDetailsModalProps {
  report: SecurityReport | null;
  isOpen: boolean;
  onClose: () => void;
}

// Simple Markdown / Rich Text parser for DFIR-IRIS report summaries
function renderSummaryContent(text: string) {
  if (!text) return <p className="text-gray-500 italic">No summary content available.</p>;

  // Split content by double newlines or lines to render blocks
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  let key = 0;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key++} className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto my-2">
            {codeBuffer.join('\n')}
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Markdown Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={key++} className="text-sm font-bold text-gray-900 mt-4 mb-1 border-b border-gray-200 pb-1">
          {line.replace('### ', '')}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={key++} className="text-base font-bold text-gray-900 mt-5 mb-2 border-b border-gray-300 pb-1">
          {line.replace('## ', '')}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-[#002B9A] mt-6 mb-2 border-b border-[#002B9A]/20 pb-1">
          {line.replace('# ', '')}
        </h2>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Bullet list items
      elements.push(
        <li key={key++} className="text-xs text-gray-700 ml-4 list-disc my-0.5">
          {line.replace(/^[-*] /, '')}
        </li>
      );
    } else if (line.trim() === '---') {
      elements.push(<hr key={key++} className="my-3 border-gray-200" />);
    } else if (line.trim()) {
      elements.push(<p key={key++} className="text-xs text-gray-800 leading-relaxed my-1 font-medium">{line}</p>);
    }
  }

  return <div className="space-y-1">{elements}</div>;
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

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      {/* Large Modal Container (max-w-4xl) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/85 backdrop-blur-2xl rounded-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-white/80 shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)] cursor-default"
      >
        {/* Header */}
        <div className="bg-[#002B9A]/95 backdrop-blur-md text-white px-6 py-4 flex items-center justify-between flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <div className="flex items-center gap-3">
            <HiOutlineDocumentText className="w-6 h-6 text-blue-300 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-black tracking-tight">{report.reportName}</h3>
              <p className="text-xs text-blue-200 font-semibold">SOC ID: {socIdDisplay} | UUID: {uuidDisplay.substring(0, 18)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 font-bold p-1 rounded-md transition"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        {/* Info Toolbar */}
        <div className="bg-slate-100/70 backdrop-blur-md border-b border-gray-200/60 px-6 py-2.5 flex items-center justify-between text-xs font-bold text-gray-700 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-500 font-semibold mr-1">Severity:</span>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black ${
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
            <div>
              <span className="text-gray-500 font-semibold mr-1">Generated:</span>
              <span className="text-gray-900 font-black">{report.dateGenerated}</span>
            </div>
          </div>

          <div className="text-gray-500 text-[11px]">
            <span>Synced: {report.synced_at ? report.synced_at.split('T')[0] : report.lastUpdated}</span>
          </div>
        </div>

        {/* Content Area with Vertical Scroll */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-gray-900 bg-[#edf2f7]">
          {/* Executive Summary */}
          <section className="bg-white/80 backdrop-blur-xl p-5 rounded-xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
              <HiOutlineShieldExclamation className="w-5 h-5 text-[#002B9A]" />
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Executive Summary</h4>
            </div>
            <div className="prose prose-sm max-w-none text-xs text-gray-800">
              {renderSummaryContent(report.summary || 'No detailed executive summary available.')}
            </div>
          </section>

          {/* Affected Devices List */}
          {report.affectedDevices && report.affectedDevices.length > 0 && (
            <section className="bg-white/80 backdrop-blur-xl p-5 rounded-xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                <HiOutlineServerStack className="w-5 h-5 text-[#002B9A]" />
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Impacted Assets ({report.affectedDevices.length})
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.affectedDevices.map((dev, idx) => (
                  <div key={idx} className="p-3 bg-white/70 backdrop-blur-sm rounded-lg border border-gray-200 text-xs">
                    <p className="font-black text-[#002B9A] text-sm">{dev.agent || dev.hostname}</p>
                    {dev.ip && <p className="text-gray-600 font-mono text-[11px] mt-0.5">IP: {dev.ip}</p>}
                    {dev.os && <p className="text-gray-500 text-[11px] mt-0.5">OS: {dev.os}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Technical Metadata */}
          <section className="bg-white/80 backdrop-blur-xl p-5 rounded-xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
              <HiOutlineInformationCircle className="w-5 h-5 text-[#002B9A]" />
              <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Audit Metadata</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-gray-700">
              <div>
                <p className="text-gray-500 font-bold text-[11px] uppercase">SOC Case ID</p>
                <p className="text-gray-900 font-black text-sm">{socIdDisplay}</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold text-[11px] uppercase">Report Category</p>
                <p className="text-gray-900 font-black text-sm">{report.type || 'Incident Report'}</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold text-[11px] uppercase">Origin Platform</p>
                <p className="text-[#002B9A] font-black text-sm">DFIR-IRIS Platform</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold text-[11px] uppercase">Integration Status</p>
                <p className="text-emerald-700 font-black text-sm">Synchronized</p>
              </div>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="bg-white/90 backdrop-blur-md border-t border-gray-200/60 px-6 py-3 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-[#002B9A] hover:bg-[#002175] text-white px-5 py-2 rounded-lg text-xs font-black transition cursor-pointer shadow-[0_4px_12px_rgba(0,43,154,0.3)]"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
