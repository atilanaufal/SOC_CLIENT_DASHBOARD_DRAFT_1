'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineServerStack,
  HiOutlineShieldExclamation,
  HiOutlineLightBulb,
  HiOutlineArrowDownTray,
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
  const summaryRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !report) return null;

  const socIdDisplay = report.soc_id || 'N/A';
  const uuidDisplay = report.report_uuid || report.id;

  const handleDownloadPDF = () => {
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '0';
    printIframe.style.height = '0';
    printIframe.style.border = '0';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow?.document;
    if (!doc) return;

    const customer = report.customerName || report.customer_name || report.client_name || report.tenant || 'Tenant';
    
    // Extract rendered markdown HTML from the modal to retain formatted tables, headers, and lists
    const renderedSummaryHtml = summaryRef.current
      ? summaryRef.current.innerHTML
      : (report.summary || 'No detailed summary available.').replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>');

    const devicesHtml = (report.affectedDevices || []).length > 0
      ? `
        <div class="section">
          <div class="section-title">Impacted Assets (${report.affectedDevices!.length})</div>
          <table>
            <thead>
              <tr>
                <th>Agent / Hostname</th>
                <th>IP Address</th>
                <th>Operating System</th>
              </tr>
            </thead>
            <tbody>
              ${report.affectedDevices!.map((dev: any) => `
                <tr>
                  <td><strong>${dev.agent || dev.hostname || '-'}</strong></td>
                  <td>${dev.ip || '-'}</td>
                  <td>${dev.os || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '';

    const recActionHtml = (report.recommendedAction || report.recommended_action)
      ? `
        <div class="section">
          <div class="section-title">Recommended Action</div>
          <div class="card" style="background:#f0fdf4; border-color:#bbf7d0;">
            <div style="font-size:12px; color:#166534; font-weight:600;">
              ${report.recommendedAction || report.recommended_action}
            </div>
          </div>
        </div>
      `
      : '';

    const sevColor = report.severity === 'Critical' ? '#B8251B' : report.severity === 'High' ? '#C2410C' : '#1E429F';
    const sevBg = report.severity === 'Critical' ? '#FDE8E8' : report.severity === 'High' ? '#FFEDD5' : '#EBF5FF';
    const sevBorder = report.severity === 'Critical' ? '#F8B4B4' : report.severity === 'High' ? '#FDBA74' : '#BFDBFE';

    const contentHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${report.reportName}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 15mm; }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 11.5px; line-height: 1.5; }
            .header { border-bottom: 2.5px solid #002B9A; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
            .title { font-size: 18px; font-weight: 800; color: #002B9A; margin: 0 0 4px 0; }
            .meta { font-size: 11px; color: #64748b; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; text-transform: uppercase; background: ${sevBg}; color: ${sevColor}; border: 1px solid ${sevBorder}; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
            .card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
            .card-value { font-size: 12px; font-weight: 700; color: #0f172a; }
            .section { margin-bottom: 18px; page-break-inside: auto; }
            .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #002B9A; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
            .summary-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; font-size: 11.5px; color: #1e293b; line-height: 1.6; }
            .summary-box h1 { font-size: 16px; font-weight: 800; color: #002B9A; margin: 14px 0 6px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; }
            .summary-box h2 { font-size: 14px; font-weight: 800; color: #0f172a; margin: 12px 0 4px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
            .summary-box h3 { font-size: 12.5px; font-weight: 700; color: #1e293b; margin: 10px 0 3px 0; }
            .summary-box h4 { font-size: 11.5px; font-weight: 700; color: #334155; margin: 8px 0 2px 0; }
            .summary-box p { margin: 6px 0; font-size: 11.5px; }
            .summary-box ul, .summary-box ol { margin: 6px 0; padding-left: 20px; }
            .summary-box li { margin-bottom: 3px; }
            .summary-box code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #f1f5f9; color: #002B9A; padding: 1.5px 4px; border-radius: 4px; font-size: 10.5px; }
            .summary-box pre { background: #0f172a; color: #38bdf8; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 10.5px; }
            .summary-box blockquote { border-left: 3px solid #002B9A; background: #f0f7ff; padding: 6px 12px; margin: 8px 0; font-style: italic; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 8px; font-size: 11px; page-break-inside: avoid; }
            th { background: #002B9A; color: #ffffff; text-align: left; padding: 7px 10px; font-weight: 700; font-size: 11px; border: 1px solid #002B9A; }
            td { border: 1px solid #cbd5e1; padding: 6px 10px; color: #1e293b; vertical-align: top; }
            tr:nth-child(even) { background: #f8fafc; }
            tr { page-break-inside: avoid; }
            img { max-width: 100%; height: auto; margin: 8px 0; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${report.reportName}</div>
              <div class="meta">SOC ID: ${socIdDisplay} | UUID: ${uuidDisplay}</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">${report.severity}</span>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-label">Customer / Tenant</div>
              <div class="card-value">${customer}</div>
            </div>
            <div class="card">
              <div class="card-label">Date Generated</div>
              <div class="card-value">${report.dateGenerated}</div>
            </div>
            <div class="card">
              <div class="card-label">Last Updated</div>
              <div class="card-value">${report.synced_at ? report.synced_at.split('T')[0] : report.lastUpdated}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Executive Summary</div>
            <div class="summary-box">${renderedSummaryHtml}</div>
          </div>

          ${recActionHtml}

          ${devicesHtml}

          <div class="footer">
            <span>ASOC Client Dashboard - Confidential Security Assessment</span>
            <span>Generated: ${new Date().toLocaleString('id-ID')}</span>
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(contentHtml);
    doc.close();

    setTimeout(() => {
      printIframe.contentWindow?.focus();
      printIframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(printIframe)) {
          document.body.removeChild(printIframe);
        }
      }, 2000);
    }, 400);
  };
  
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
            className="text-white hover:text-gray-300 font-bold p-1.5 rounded-lg transition cursor-pointer"
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
              <span className="text-gray-500 font-medium">Customer:</span>
              <span className="text-[#002B9A] font-bold">
                {report.customerName || report.customer_name || report.client_name || report.tenant || 'N/A'}
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
            <div ref={summaryRef}>
              <MarkdownRenderer content={report.summary || 'No detailed summary available.'} />
            </div>
          </section>



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
        <div className="bg-white/90 backdrop-blur-md border-t border-gray-200/60 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <button
            onClick={handleDownloadPDF}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <HiOutlineArrowDownTray className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
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
