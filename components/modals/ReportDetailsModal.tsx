'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
<<<<<<< Updated upstream
import { SecurityReport } from '@/lib/mock-data';
=======
import { SecurityReport } from '@/lib/types';
>>>>>>> Stashed changes
import { HiOutlineXMark, HiOutlineDocumentText } from 'react-icons/hi2';

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

    // Base64 images or standard markdown images ![alt](url)
    const imgMatch = line.match(/!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^\)]+|\https?:\/\/[^\)]+)\)/);
    if (imgMatch) {
      elements.push(
        <div key={key++} className="my-3 flex flex-col items-center">
          <img src={imgMatch[2]} alt={imgMatch[1] || 'Report Image'} className="max-w-full h-auto rounded border border-gray-300 max-h-[450px] object-contain" />
          {imgMatch[1] && <span className="text-xs text-gray-500 italic mt-1">{imgMatch[1]}</span>}
        </div>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-lg font-black text-navy-800 border-b border-gray-200 pb-1 mt-4 mb-2">{line.replace('## ', '')}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-base font-bold text-gray-900 mt-3 mb-1.5">{line.replace('### ', '')}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-xl font-black text-navy-900 border-b-2 border-navy-800 pb-1 mt-4 mb-2">{line.replace('# ', '')}</h1>);
    } else if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) {
      const isChecked = line.startsWith('- [x] ');
      elements.push(
        <div key={key++} className="flex items-center gap-2 my-1 text-xs font-semibold text-gray-800 pl-2">
          <input type="checkbox" checked={isChecked} readOnly className="rounded border-gray-300 text-navy-800" />
          <span>{line.replace(/- \[[ x]\] /, '')}</span>
        </div>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={key++} className="text-xs font-semibold text-gray-800 ml-4 list-disc my-0.5 leading-relaxed">
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
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : report.severity === 'High'
                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                    : report.severity === 'Medium'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
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
          {/* Full Summary Section */}
          <div className="bg-white/90 p-4 rounded-md border border-gray-200">
            <h4 className="text-sm font-black uppercase text-[#002B9A] tracking-wider mb-3 flex items-center gap-2 border-b border-blue-200 pb-2">
              <HiOutlineDocumentText className="w-4 h-4 text-[#0066B1]" />
              <span>Full Report Summary</span>
            </h4>
            <div className="prose prose-sm max-w-none">
              {renderSummaryContent(report.summary)}
            </div>
          </div>

          {/* Recommended Action Section */}
          {report.recommendedAction && (
            <div className="bg-white/90 p-4 rounded-md border border-gray-200">
              <h4 className="text-sm font-black uppercase text-amber-800 tracking-wider mb-2">
                Recommended Action
              </h4>
              <div className="text-xs font-semibold text-gray-900 whitespace-pre-wrap leading-relaxed">
                {renderSummaryContent(report.recommendedAction)}
              </div>
            </div>
          )}

          {/* Optional Affected Devices (only rendered if present in DB) */}
          {report.affectedDevices && report.affectedDevices.length > 0 && (
            <div>
              <h4 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider mb-2">Affected Devices</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {report.affectedDevices.map((dev, idx) => (
                  <div key={idx} className="bg-white/90 p-2.5 rounded-md border border-gray-200 text-xs">
                    <p className="font-black text-[#002B9A]">{dev.agent}</p>
                    <p className="text-gray-600 font-medium">IP: {dev.ipAddress}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-200/80 border-t border-gray-300 px-6 py-3 flex items-center justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-[#002B9A] hover:bg-[#002175] text-white font-extrabold px-5 py-2 rounded-md text-xs transition border border-[#002175]"
          >
            Close Full Summary
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
