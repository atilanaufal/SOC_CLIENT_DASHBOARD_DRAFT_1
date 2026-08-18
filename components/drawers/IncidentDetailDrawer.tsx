'use client';

import React, { useState } from 'react';
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
  const router = useRouter();
  const [showLogsModal, setShowLogsModal] = useState(false);

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
        className="lg:hidden fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-150 cursor-pointer"
      />

      {/* Detail Panel Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 lg:z-0 lg:relative lg:inset-auto h-full w-[85vw] max-w-sm lg:w-[380px] bg-white border border-gray-300 rounded-md flex flex-col flex-shrink-0 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-gray-900 px-4 py-3 flex-shrink-0 bg-white">
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
              <p className="font-black text-sm text-navy-800">{agentIpDisplay}</p>
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
            <p className="text-xs text-gray-700 font-medium leading-relaxed bg-blue-50/50 p-2.5 rounded-md border border-blue-100">
              {incident.description || 'Host-based anomaly detection event'}
            </p>
          </div>

          {/* Affected File (if available) */}
          {incident.affected_file && (
            <div className="pt-3 border-t border-gray-200">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">Affected File</h4>
              <p className="text-xs font-mono text-gray-800 bg-gray-50 p-2 rounded-md border border-gray-200 break-all">
                {incident.affected_file}
              </p>
            </div>
          )}

          {/* MITRE */}
          {incident.mitre && (
            <div className="pt-3 border-t border-gray-200">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-1">MITRE ATT&CK</h4>
              <p className="text-xs font-black text-navy-800 bg-gray-50 p-2 rounded-md border border-gray-200">
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
        <div className="p-3.5 border-t border-gray-200 flex-shrink-0 bg-gray-50">
          <button
            onClick={() => setShowLogsModal(true)}
            className="w-full bg-navy-800 hover:bg-navy-900 text-white font-extrabold py-2.5 rounded-md text-sm transition shadow-xs flex items-center justify-center gap-2"
          >
            <HiOutlineDocumentText className="w-4 h-4 text-blue-300" />
            <span>Full Logs</span>
          </button>
        </div>
      </div>

      {/* Full Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md max-w-2xl w-full overflow-hidden border border-gray-300 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="bg-navy-800 text-white px-4 py-3 flex items-center justify-between">
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
            <div className="p-3 border-t border-gray-200 flex justify-end bg-gray-50">
              <button
                onClick={() => setShowLogsModal(false)}
                className="bg-navy-800 text-white px-4 py-1.5 rounded-md text-xs font-bold hover:bg-navy-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
