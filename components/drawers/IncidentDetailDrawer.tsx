'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Incident } from '@/lib/mock-data';
import { HiOutlineXMark, HiOutlineDocumentText } from 'react-icons/hi2';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [showLogsModal, setShowLogsModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        className="fixed inset-y-0 right-0 z-50 lg:z-0 lg:relative lg:inset-auto h-full w-[85vw] max-w-sm lg:w-[380px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col flex-shrink-0 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#002B9A] px-4 py-3 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h3 className="text-xl font-black text-gray-900 tracking-tight">Details</h3>
          <button
            onClick={onClose}
            className="text-gray-900 font-bold hover:text-gray-600 p-1 rounded-md transition"
            aria-label="Close details panel"
          >
            <HiOutlineXMark className="w-6 h-6" />
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
                    : 'text-amber-600'
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
            className="w-full bg-[#002B9A] hover:bg-[#002175] text-white font-extrabold py-2.5 rounded-md text-sm transition flex items-center justify-center gap-2 border border-[#002175]"
          >
            <HiOutlineDocumentText className="w-4 h-4 text-blue-300" />
            <span>Full Logs</span>
          </button>
        </div>
      </div>

      {/* Full Logs Modal */}
      {showLogsModal && mounted && createPortal(
        <div
          onClick={() => setShowLogsModal(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#edf2f7] backdrop-blur-xl rounded-md max-w-2xl w-full overflow-hidden border border-gray-300 flex flex-col max-h-[85vh] cursor-default"
          >
            <div className="bg-[#002B9A] text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-base">Full Logs — Rule {ruleIdDisplay} ({incident.agent})</h3>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-white hover:text-gray-300 font-bold"
              >
                <HiOutlineXMark className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto bg-gray-900 text-green-400 font-mono text-xs leading-relaxed flex-1">
              <pre className="whitespace-pre-wrap break-all">
                {incident.full_logs || `Rule ID: ${ruleIdDisplay}\nAgent: ${incident.agent}\nDescription: ${incident.description}`}
              </pre>
            </div>
            <div className="p-3 border-t border-gray-200 flex justify-end bg-white/80">
              <button
                onClick={() => setShowLogsModal(false)}
                className="bg-[#002B9A] text-white px-4 py-1.5 rounded-md text-xs font-bold hover:bg-[#002175]"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
