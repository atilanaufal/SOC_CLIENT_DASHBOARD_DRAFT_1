'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
<<<<<<< Updated upstream
import { Incident } from '@/lib/mock-data';
=======
import { Incident } from '@/lib/types';
>>>>>>> Stashed changes
import {
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineClipboardDocument,
  HiOutlineCheck,
  HiOutlineArrowDownTray,
  HiOutlineMagnifyingGlass,
  HiOutlineServerStack,
  HiOutlineClock,
  HiOutlineCodeBracket,
  HiOutlineCommandLine,
} from 'react-icons/hi2';

interface IncidentDetailDrawerProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
}

export const IncidentDetailDrawer: React.FC<IncidentDetailDrawerProps> = ({
  incident,
  isOpen,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute log content
  const fullLogText = useMemo(() => {
    if (!incident) return '';
    if (incident.full_logs && typeof incident.full_logs === 'string' && incident.full_logs.trim()) {
      return incident.full_logs;
    }
    // Fallback structured JSON format if raw full_logs string is missing
    const fallbackObj = {
      timestamp: incident.firstObserved || new Date().toISOString(),
      rule: {
<<<<<<< Updated upstream
        id: incident.rule_id || incident.ruleId || '100200',
        severity: incident.severity || 'Medium',
        description: incident.description || incident.incidentName,
        mitre: {
          id: incident.mitre_id || incident.mitre || 'T1110',
          tactic: incident.mitre_tactic || 'Credential Access',
          technique: incident.mitre_technique || 'Brute Force',
        },
      },
      agent: {
        id: incident.agent || '001',
        name: incident.host || incident.agent || 'tguard',
        ip: incident.agent_ip || incident.sourceIp || '10.21.126.82',
=======
        id: incident.rule_id || incident.ruleId || 'N/A',
        severity: incident.severity || 'Medium',
        description: incident.description || incident.incidentName,
        mitre: {
          id: incident.mitre_id || incident.mitre || 'N/A',
          tactic: incident.mitre_tactic || 'N/A',
          technique: incident.mitre_technique || 'N/A',
        },
      },
      agent: {
        id: incident.agent || 'N/A',
        name: incident.host || incident.agent || 'Agent',
        ip: incident.agent_ip || incident.sourceIp || 'N/A',
>>>>>>> Stashed changes
      },
      manager: {
        name: 'wazuh.manager',
      },
<<<<<<< Updated upstream
      location: incident.affected_file || '/var/log/auth.log',
      data: {
        srcip: incident.sourceIp || incident.agent_ip || '10.21.126.82',
        dstip: incident.destIp || incident.ip_destination || '10.21.126.1',
=======
      location: incident.affected_file || 'N/A',
      data: {
        srcip: incident.sourceIp || incident.agent_ip || 'N/A',
        dstip: incident.destIp || incident.ip_destination || 'N/A',
>>>>>>> Stashed changes
        count: incident.count || 1,
        incident_type: incident.incidentName,
        affected_file: incident.affected_file || null,
      },
<<<<<<< Updated upstream
      raw_log: `${incident.firstObserved || new Date().toISOString()} ${incident.host || 'tguard'} ossec: Alert [${incident.rule_id || incident.ruleId || '100200'}] (${incident.severity || 'Medium'}): ${incident.description || incident.incidentName}`,
=======
      raw_log: `${incident.firstObserved || new Date().toISOString()} ${incident.host || 'Agent'} ossec: Alert [${incident.rule_id || incident.ruleId || 'N/A'}] (${incident.severity || 'Medium'}): ${incident.description || incident.incidentName}`,
>>>>>>> Stashed changes
    };
    return JSON.stringify(fallbackObj, null, 2);
  }, [incident]);

  // Pretty raw syslog single-line format
  const rawSyslogText = useMemo(() => {
    if (!incident) return '';
    try {
      const parsed = JSON.parse(fullLogText);
      if (parsed.full_log || parsed.raw_log) {
        return parsed.full_log || parsed.raw_log;
      }
      return `${parsed.timestamp || incident.firstObserved} ${parsed.agent?.name || incident.host} ossec: Alert [Rule ${parsed.rule?.id || incident.rule_id}] (${parsed.rule?.severity || incident.severity}): ${parsed.rule?.description || incident.description} [srcip: ${parsed.data?.srcip || incident.sourceIp}]`;
    } catch {
      return fullLogText;
    }
  }, [incident, fullLogText]);

  // Active displayed log text
  const displayedLog = viewMode === 'structured' ? fullLogText : rawSyslogText;

  // Filtered log text if search query is active
  const filteredLog = useMemo(() => {
    if (!logSearchQuery.trim()) return displayedLog;
    const lines = displayedLog.split('\n');
    const matched = lines.filter((line: string) => line.toLowerCase().includes(logSearchQuery.toLowerCase()));
    if (matched.length === 0) {
      return `// No matching lines found for query: "${logSearchQuery}"\n\n${displayedLog}`;
    }
    return matched.join('\n');
  }, [displayedLog, logSearchQuery]);

  const handleCopyLog = () => {
    navigator.clipboard.writeText(displayedLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLog = () => {
    const filename = `incident-log-${incident?.rule_id || 'rule'}-${Date.now()}.${viewMode === 'structured' ? 'json' : 'log'}`;
    const blob = new Blob([displayedLog], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !incident) return null;

  const ruleIdDisplay = incident.rule_id || incident.ruleId || 'N/A';
  const agentIpDisplay = incident.agent_ip || incident.sourceIp || incident.ip_source || 'N/A';
  const countDisplay = incident.count ? `${incident.count} Detected` : '1 Detected';
  const firstParts = (incident.firstObserved || '').split(' ');
  const firstDate = firstParts.slice(0, 3).join(' ');
  const firstTime = firstParts.slice(3).join(' ');

  const lastParts = (incident.lastObserved || incident.firstObserved || '').split(' ');
  const lastDate = lastParts.slice(0, 3).join(' ');
  const lastTime = lastParts.slice(3).join(' ');

  return (
    <>
      {/* Mobile Backdrop Overlay (< lg) */}
      <div
        onClick={onClose}
        className="lg:hidden fixed inset-0 bg-slate-950/30 backdrop-blur-sm z-40 animate-in fade-in duration-150 cursor-pointer"
      />

      {/* Detail Panel Container */}
      <div
        onClick={(e) => e.stopPropagation()}
<<<<<<< Updated upstream
        className="fixed inset-y-0 right-0 z-50 lg:z-0 lg:relative lg:inset-auto h-full w-[85vw] max-w-sm lg:w-[380px] 2xl:w-[440px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col flex-shrink-0 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#002B9A] px-4 2xl:px-5 py-3 2xl:py-4 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
=======
        className="fixed inset-y-0 right-0 z-50 lg:z-30 lg:inset-auto lg:top-[84px] lg:bottom-3.5 lg:right-6 w-[85vw] max-w-sm lg:w-[380px] 2xl:w-[440px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200/60 px-4 2xl:px-5 py-3 2xl:py-4 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
>>>>>>> Stashed changes
          <h3 className="text-lg 2xl:text-xl font-black text-gray-900 tracking-tight">Incident Details</h3>
          <button
            onClick={onClose}
            className="text-gray-900 font-bold hover:text-gray-600 p-1 rounded-md transition cursor-pointer"
            aria-label="Close details panel"
          >
            <HiOutlineXMark className="w-5 h-5 2xl:w-6 2xl:h-6" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-gray-900">
          {/* Host & Agent IP */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Host</p>
              <p className="font-black text-sm text-gray-900">{incident.host || 'Unknown Host'}</p>
            </div>
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Agent IP</p>
              <p className="font-black text-sm text-[#002B9A]">{agentIpDisplay}</p>
            </div>
          </div>

          {/* Rule ID & Incident Type */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Rule ID</p>
              <p className="font-black text-sm text-gray-900">{ruleIdDisplay}</p>
            </div>
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Incident Type</p>
              <p className="font-black text-sm text-gray-900">{incident.incidentName}</p>
            </div>
          </div>

          {/* Count & Severity */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Count</p>
              <p className="font-black text-sm text-gray-900">{countDisplay}</p>
            </div>
            <div>
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Severity</p>
              <span
                className={`font-black text-sm ${
                  incident.severity === 'Critical'
                    ? 'text-red-600'
                    : incident.severity === 'High'
                    ? 'text-orange-600'
                    : incident.severity === 'Medium'
                    ? 'text-amber-600'
                    : 'text-blue-600'
                }`}
              >
                {incident.severity}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="pt-3 border-t border-gray-200">
            <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">Description</h4>
            <p className="text-xs text-gray-700 font-medium leading-relaxed bg-blue-50/70 p-2.5 rounded-md border border-blue-100">
              {incident.description || 'Host-based anomaly detection event'}
            </p>
          </div>

          {/* Affected File (if available) */}
          {incident.affected_file && (
            <div className="pt-3 border-t border-gray-200">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">Affected File</h4>
              <p className="text-xs font-mono text-gray-800 bg-white/70 backdrop-blur-sm p-2 rounded-md border border-gray-200 break-all">
                {incident.affected_file}
              </p>
            </div>
          )}

          {/* MITRE */}
          {incident.mitre && (
            <div className="pt-3 border-t border-gray-200">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">MITRE ATT&CK</h4>
              <p className="text-xs font-black text-[#002B9A] bg-white/70 backdrop-blur-sm p-2 rounded-md border border-gray-200">
                {incident.mitre}
              </p>
            </div>
          )}

          {/* First Observed */}
          <div className="pt-3 border-t border-gray-200">
            <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">First Observed</h4>
            <div className="flex flex-col text-xs leading-tight">
              <span className="font-black text-gray-900">{firstDate || incident.firstObserved}</span>
              {firstTime && <span className="font-bold text-gray-500 mt-0.5">{firstTime}</span>}
            </div>
          </div>

          {/* Last Observed */}
          <div className="pt-3 border-t border-gray-200">
            <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">Last Observed</h4>
            <div className="flex flex-col text-xs leading-tight">
              <span className="font-black text-gray-900">{lastDate || incident.lastObserved || incident.firstObserved}</span>
              {lastTime && <span className="font-bold text-gray-500 mt-0.5">{lastTime}</span>}
            </div>
          </div>
        </div>

        {/* Full Logs Action Button */}
        <div className="p-3.5 border-t border-gray-200 flex-shrink-0 bg-white/70 backdrop-blur-sm">
          <button
            onClick={() => setShowLogsModal(true)}
            className="w-full bg-[#002B9A] hover:bg-[#002175] active:bg-[#001854] text-white font-extrabold py-2.5 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-2 border border-[#002175] shadow-sm cursor-pointer"
          >
            <HiOutlineDocumentText className="w-4 h-4 text-blue-200" />
            <span>View Full Database Logs</span>
          </button>
        </div>
      </div>

      {/* Modern Light-Themed Full Logs Modal */}
      {showLogsModal && mounted && createPortal(
        <div
          onClick={() => setShowLogsModal(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white/95 backdrop-blur-2xl rounded-2xl max-w-4xl w-full overflow-hidden border border-white/80 shadow-[0_20px_60px_rgba(0,43,154,0.2),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col max-h-[90vh] cursor-default animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="bg-[#002B9A] text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-200 rounded-xl border border-blue-400/30">
                  <HiOutlineDocumentText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-base sm:text-lg tracking-tight text-white">
                      Security Incident Full Logs
                    </h3>
                    <span className="px-2.5 py-0.5 text-[11px] font-black bg-white/20 text-blue-100 rounded-md border border-white/25">
                      Rule {ruleIdDisplay}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${
                        incident.severity === 'Critical'
                          ? 'bg-red-500/30 text-red-200 border-red-400/40'
                          : incident.severity === 'High'
                          ? 'bg-orange-500/30 text-orange-200 border-orange-400/40'
                          : 'bg-amber-500/30 text-amber-200 border-amber-400/40'
                      }`}
                    >
                      {incident.severity}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100/80 font-medium mt-0.5">
                    Verified raw log records from database ({incident.host || incident.agent || 'Wazuh Agent'})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowLogsModal(false)}
                className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition border border-transparent hover:border-white/20 cursor-pointer"
                title="Close Modal"
              >
                <HiOutlineXMark className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Modal Control & Filter Toolbar */}
            <div className="px-5 sm:px-6 py-2.5 bg-slate-100/90 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <button
                  onClick={() => setViewMode('structured')}
                  className={`px-3 py-1.5 font-extrabold rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'structured'
                      ? 'bg-[#002B9A] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <HiOutlineCodeBracket className="w-3.5 h-3.5" />
                  <span>Structured JSON</span>
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={`px-3 py-1.5 font-extrabold rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'raw'
                      ? 'bg-[#002B9A] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <HiOutlineCommandLine className="w-3.5 h-3.5" />
                  <span>Raw Syslog</span>
                </button>
              </div>

              {/* Search Within Log */}
              <div className="flex-1 min-w-[200px] max-w-xs relative">
                <HiOutlineMagnifyingGlass className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search log lines..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#002B9A] focus:border-[#002B9A]"
                />
              </div>

              {/* Actions: Copy & Download */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyLog}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 active:bg-gray-100 text-[#002B9A] font-extrabold rounded-lg border border-gray-200 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <HiOutlineClipboardDocument className="w-3.5 h-3.5" />
                      <span>Copy Log</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadLog}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-extrabold rounded-lg border border-gray-200 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  title="Download log file"
                >
                  <HiOutlineArrowDownTray className="w-3.5 h-3.5 text-[#002B9A]" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Modal Body: Clean Light Theme Log Display */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/70">
              <div className="bg-white rounded-xl border border-gray-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03)] p-4 sm:p-5 overflow-x-auto relative">
                <pre className="font-mono text-xs sm:text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap break-all select-text selection:bg-blue-100 selection:text-[#002B9A]">
                  {filteredLog}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3 border-t border-gray-200 bg-slate-100 flex items-center justify-between text-xs text-gray-700 font-medium">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-bold text-gray-800">
                  <HiOutlineServerStack className="w-4 h-4 text-[#002B9A]" />
                  <span>Host: {incident.host || incident.agent}</span>
                </span>
                <span className="hidden sm:inline text-gray-300">|</span>
                <span className="hidden sm:flex items-center gap-1 text-gray-500 font-semibold">
                  <HiOutlineClock className="w-3.5 h-3.5" />
                  <span>{incident.lastObserved || incident.firstObserved}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="px-4 py-1.5 bg-[#002B9A] hover:bg-[#002175] text-white font-extrabold rounded-lg transition border border-[#002175] shadow-sm cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
