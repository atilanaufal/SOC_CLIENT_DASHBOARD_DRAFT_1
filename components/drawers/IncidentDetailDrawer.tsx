'use client';

import React, { useState, useMemo } from 'react';
import {
  HiOutlineXMark,
  HiOutlineClipboardDocument,
  HiOutlineCheck,
  HiOutlineArrowDownTray,
  HiOutlineMagnifyingGlass,
  HiOutlineCodeBracket,
} from 'react-icons/hi2';
import { Incident } from '@/lib/types';

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
  const [copied, setCopied] = useState(false);
  const [isRawLogOpen, setIsRawLogOpen] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');

  // Format full JSON log representation for debugging / SIEM export
  const fullLogText = useMemo(() => {
    if (!incident) return '';
    if (incident.full_log) {
      if (typeof incident.full_log === 'object') {
        return JSON.stringify(incident.full_log, null, 2);
      }
      try {
        const parsed = JSON.parse(incident.full_log);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return incident.full_log;
      }
    }
    // Fallback constructed standard Wazuh alert structure
    const fallbackObj = {
      timestamp: incident.firstObserved || new Date().toISOString(),
      rule: {
        id: incident.rule_id || incident.ruleId || 'N/A',
        level: incident.rule_level || 7,
        description: incident.description || incident.incidentName,
        mitre: incident.mitre ? { id: [incident.mitre], technique: [incident.mitre] } : undefined,
      },
      agent: {
        id: incident.agent || 'N/A',
        name: incident.host || incident.agent || 'Agent',
        ip: incident.agent_ip || incident.sourceIp || 'N/A',
      },
      manager: {
        name: 'wazuh.manager',
      },
      location: incident.affected_file || 'N/A',
      data: {
        srcip: incident.sourceIp || incident.agent_ip || 'N/A',
        dstip: incident.destIp || incident.ip_destination || 'N/A',
        count: incident.count || 1,
        incident_type: incident.incidentName,
        affected_file: incident.affected_file || null,
      },
      raw_log: `${incident.firstObserved || new Date().toISOString()} ${incident.host || 'Agent'} ossec: Alert [${incident.rule_id || incident.ruleId || 'N/A'}] (${incident.severity || 'Medium'}): ${incident.description || incident.incidentName}`,
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
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !incident) return null;

  const ruleIdDisplay = incident.rule_id || incident.ruleId || 'N/A';
  const countDisplay = incident.count !== undefined ? incident.count : 1;
  const parts = (incident.firstObserved || '').split(' ');
  const firstDate = parts.slice(0, 3).join(' ');
  const firstTime = parts.slice(3).join(' ');

  const lastParts = (incident.lastObserved || incident.firstObserved || '').split(' ');
  const lastDate = lastParts.slice(0, 3).join(' ');
  const lastTime = lastParts.slice(3).join(' ');

  return (
    <>
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 lg:z-30 lg:inset-auto lg:top-[84px] lg:bottom-3.5 lg:right-6 w-[85vw] max-w-sm lg:w-[380px] 2xl:w-[440px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200/60 px-4 2xl:px-5 py-3 2xl:py-4 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h3 className="text-lg 2xl:text-xl font-black text-gray-900 tracking-tight">Incident Details</h3>
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
          {/* Agent & Host Info */}
          <div>
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Affected Agent</p>
            <p className="text-sm font-black text-[#002B9A]">{incident.agent}</p>
            {incident.host && incident.host !== incident.agent && (
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Hostname: {incident.host}</p>
            )}
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
                    ? 'text-[#B8251B]'
                    : incident.severity === 'High'
                    ? 'text-[#EA580C]'
                    : incident.severity === 'Medium'
                    ? 'text-[#5B9BD5]'
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

        {/* Footer with Raw Log button */}
        <div className="border-t border-gray-200/60 p-4 bg-white/90 backdrop-blur-md flex-shrink-0 flex items-center justify-between">
          <button
            onClick={() => setIsRawLogOpen(true)}
            className="w-full bg-[#002B9A] text-white py-2.5 px-4 rounded-lg font-black text-xs hover:bg-[#002175] transition flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,43,154,0.3)] cursor-pointer"
          >
            <HiOutlineCodeBracket className="w-4 h-4 text-blue-300" />
            <span>View Full Raw Log</span>
          </button>
        </div>
      </div>

      {/* Full Raw Log Modal View */}
      {isRawLogOpen && (
        <div
          onClick={() => setIsRawLogOpen(false)}
          className="fixed inset-0 bg-slate-950/25 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white/85 backdrop-blur-2xl rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-white/80 shadow-[0_20px_50px_rgba(0,43,154,0.12),inset_0_1px_2px_rgba(255,255,255,0.95)] cursor-default"
          >
            {/* Modal Header */}
            <div className="bg-[#002B9A]/95 backdrop-blur-md text-white px-5 py-3.5 flex items-center justify-between flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <div className="flex items-center gap-2">
                <HiOutlineCodeBracket className="w-5 h-5 text-blue-300" />
                <h3 className="text-base font-black tracking-tight">Security Event Full Log (Wazuh SIEM)</h3>
              </div>
              <button
                onClick={() => setIsRawLogOpen(false)}
                className="text-white hover:text-gray-300 font-bold p-1 rounded-md transition"
                aria-label="Close modal"
              >
                <HiOutlineXMark className="w-5 h-5" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="bg-slate-100/70 backdrop-blur-md border-b border-gray-200/60 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
              {/* Search within log */}
              <div className="relative flex-1 min-w-[200px]">
                <HiOutlineMagnifyingGlass className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Filter within log fields..."
                  className="w-full bg-white/80 text-xs font-bold text-gray-900 pl-8 pr-2.5 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#002B9A]"
                />
              </div>

              {/* View mode toggle & Actions */}
              <div className="flex items-center gap-2">
                <div className="bg-white/80 p-0.5 rounded-md border border-gray-300 flex text-xs font-black">
                  <button
                    onClick={() => setViewMode('structured')}
                    className={`px-2.5 py-1 rounded ${viewMode === 'structured' ? 'bg-[#002B9A] text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => setViewMode('raw')}
                    className={`px-2.5 py-1 rounded ${viewMode === 'raw' ? 'bg-[#002B9A] text-white' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Syslog
                  </button>
                </div>

                <button
                  onClick={handleCopyLog}
                  className="bg-white/90 hover:bg-white text-gray-800 text-xs font-black px-2.5 py-1.5 rounded-md border border-gray-300 flex items-center gap-1 transition shadow-sm"
                >
                  {copied ? <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-600" /> : <HiOutlineClipboardDocument className="w-3.5 h-3.5 text-gray-600" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={handleDownloadLog}
                  className="bg-white/90 hover:bg-white text-gray-800 text-xs font-black px-2.5 py-1.5 rounded-md border border-gray-300 flex items-center gap-1 transition shadow-sm"
                >
                  <HiOutlineArrowDownTray className="w-3.5 h-3.5 text-gray-600" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* Code Log Content */}
            <div className="p-4 overflow-y-auto flex-1 bg-gray-950 font-mono text-xs text-emerald-400 select-text leading-relaxed">
              <pre className="whitespace-pre-wrap break-all">
                {filteredLog}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
