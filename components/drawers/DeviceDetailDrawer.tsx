'use client';

import React, { useState, useEffect } from 'react';
import { Device } from '@/lib/mock-data';
import { useRouter } from 'next/navigation';
import { HiOutlineXMark, HiOutlineArrowPath } from 'react-icons/hi2';
import { getRiskCategory } from '@/lib/risk-score';
import { fetchDeviceHardware } from '@/lib/api-client';

interface DeviceDetailDrawerProps {
  device: Device | null;
  isOpen: boolean;
  onClose: () => void;
  highlightIssue?: string;
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  device,
  isOpen,
  onClose,
  highlightIssue,
}) => {
  const router = useRouter();
  const [hardware, setHardware] = useState<{ cpuName: string; cores: string | number; ramTotal: string } | null>(null);
  const [loadingHw, setLoadingHw] = useState(false);

  useEffect(() => {
    if (isOpen && device?.id) {
      setLoadingHw(true);
      fetchDeviceHardware(device.id)
        .then((data) => setHardware(data))
        .catch(() => setHardware({ cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' }))
        .finally(() => setLoadingHw(false));
    } else {
      setHardware(null);
    }
  }, [isOpen, device?.id]);

  if (!isOpen || !device) return null;

  const raw = (device.criticalCount || 0) * 10 + (device.highCount || 0) * 6 + (device.mediumCount || 0) * 3;
  const scoreVal = typeof device.score === 'number' ? device.score : Math.min(100, raw);
  const currentCat = getRiskCategory(scoreVal);

  const lastSeenDateStr = (device as any).lastSeenDate || device.lastSeen.split('(')[0]?.trim() || device.lastSeen;
  const lastSeenAgoStr = (device as any).lastSeenAgo || (device.lastSeen.includes('(') ? device.lastSeen.split('(')[1]?.replace(')', '').trim() : '');

  return (
    <>
      {/* Mobile Backdrop (< lg) */}
      <div
        onClick={onClose}
        className="lg:hidden fixed inset-0 bg-slate-950/30 backdrop-blur-sm z-40 animate-in fade-in duration-150"
      />

      {/* Detail Panel Container */}
      <div className="fixed inset-y-0 right-0 z-50 lg:z-0 lg:relative lg:inset-auto h-full w-[85vw] max-w-sm lg:w-[380px] bg-white/80 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-l-xl lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col flex-shrink-0 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#002B9A] px-4 py-3 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight">Device Details</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-900 font-bold hover:text-gray-600 p-1 rounded-md transition"
            aria-label="Close device details"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-gray-900">
          {/* Agent Name & Agent ID side-by-side */}
          <div className="bg-white/70 backdrop-blur-sm p-3 rounded-md border border-gray-200">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-1">Agent Information</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-black text-[#002B9A] break-all">{device.agent}</span>
              <span className="bg-[#002B9A] text-white text-xs font-black px-2.5 py-1 rounded-md flex-shrink-0">
                ID: {device.id}
              </span>
            </div>
          </div>

          {/* Status & Last Seen Aligned Side-by-Side */}
          <div className="pt-1">
            <div className="grid grid-cols-2 gap-2 text-xs bg-white/70 backdrop-blur-sm p-3 rounded-md border border-gray-200">
              <div>
                <p className="text-gray-500 font-bold mb-1 uppercase tracking-wider text-[10px]">Status</p>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-black ${
                    device.status === 'Online'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  {device.status}
                </span>
              </div>

              <div>
                <p className="text-gray-500 font-bold mb-0.5 uppercase tracking-wider text-[10px]">Last Seen</p>
                <div className="flex flex-col leading-tight">
                  <span className="font-extrabold text-gray-900 text-xs">{lastSeenDateStr}</span>
                  {lastSeenAgoStr ? <span className="text-[11px] text-gray-500 font-semibold">{lastSeenAgoStr}</span> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Agent Risk Score Section */}
          <div className="pt-2 border-t border-gray-200">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-1.5">Agent Risk Score</p>
            <div className="bg-white/70 backdrop-blur-sm p-3 rounded-md border border-gray-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black text-gray-900">{scoreVal}</span>
                  <span className="text-xs text-gray-500 font-bold">/ 100</span>
                </div>
                <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{currentCat.meaning}</p>
              </div>
              <span
                style={{ backgroundColor: currentCat.color }}
                className="text-white font-black px-3 py-1 rounded-md text-xs tracking-wide"
              >
                {currentCat.label}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-0.5">Operating System</p>
            <p className="text-sm font-black text-gray-900">{device.os}</p>
          </div>

          {/* Replaced Asset Info with System Specifications from Wazuh syscollector API */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider">System Specifications</p>
              {loadingHw && <HiOutlineArrowPath className="w-3.5 h-3.5 animate-spin text-[#002B9A]" />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs bg-white/70 backdrop-blur-sm p-2.5 rounded-md border border-gray-200">
              <div className="col-span-3 pb-1 border-b border-gray-200">
                <p className="text-gray-500 font-bold text-[10px]">CPU Model</p>
                <p className="font-black text-gray-900 truncate" title={hardware?.cpuName || device.cpu || 'N/A'}>
                  {hardware?.cpuName || device.cpu || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 font-bold text-[10px]">Cores</p>
                <p className="font-black text-gray-900">{hardware?.cores || device.cores || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500 font-bold text-[10px]">RAM Total</p>
                <p className="font-black text-gray-900">{hardware?.ramTotal || device.ram || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Installed Agent Metadata & Registration Date */}
          <div className="pt-2 border-t border-gray-200">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-1.5">Installed Agent Metadata</p>
            <div className="grid grid-cols-2 gap-2 text-xs bg-white/70 backdrop-blur-sm p-2.5 rounded-md border border-gray-200">
              <div>
                <p className="text-gray-500 font-bold text-[10px]">Wazuh Version</p>
                <p className="font-black text-gray-900">{device.agentVersion || 'Wazuh Agent'}</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold text-[10px]">IP Address</p>
                <p className="font-black text-[#002B9A]">{device.ipAddress || 'N/A'}</p>
              </div>
              <div className="col-span-2 pt-1 border-t border-gray-200">
                <p className="text-gray-500 font-bold text-[10px]">Registration Date</p>
                <p className="font-black text-gray-900">
                  {(device as any).registrationDate || (device as any).dateAdd || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Detected Issues Section (Max 5 items with overflow indicator) */}
          <div className="pt-2 border-t border-gray-200">
            <p className="font-extrabold text-xs text-gray-500 uppercase tracking-wider mb-1.5">Detected Issues</p>
            {(!device.detectedIssues || device.detectedIssues.length === 0) ? (
              <p className="text-xs text-gray-500 italic">No critical incident issues detected on this agent.</p>
            ) : (
              (() => {
                const issues = [...(device.detectedIssues || [])];
                if (highlightIssue && !issues.some(i => i.toLowerCase().includes(highlightIssue.toLowerCase()) || highlightIssue.toLowerCase().includes(i.toLowerCase()))) {
                  issues.unshift(highlightIssue);
                }
                const maxCount = 5;
                const displayed = issues.slice(0, maxCount);
                const remaining = issues.length - maxCount;

                return (
                  <div className="space-y-1.5">
                    <ul className="list-disc pl-4 text-xs space-y-1">
                      {displayed.map((issue, idx) => {
                        const isMatch = Boolean(
                          highlightIssue &&
                          (issue.toLowerCase().includes(highlightIssue.toLowerCase()) ||
                           highlightIssue.toLowerCase().includes(issue.toLowerCase()))
                        );
                        return (
                          <li
                            key={idx}
                            className={
                              isMatch
                                ? 'bg-red-100 text-red-800 font-black p-1 px-2 rounded border border-red-300 list-none'
                                : 'font-semibold text-gray-800'
                            }
                          >
                            {issue}
                          </li>
                        );
                      })}
                    </ul>
                    {remaining > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                          + {remaining} isu lainnya terdeteksi
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        <div className="p-3.5 border-t border-gray-200 flex-shrink-0 bg-white/70 backdrop-blur-sm">
          <button
            onClick={() => {
              onClose();
              router.push(`/incidents?agent=${encodeURIComponent(device.agent)}`);
            }}
            className="w-full bg-[#002B9A] hover:bg-[#002175] text-white font-extrabold py-2.5 rounded-md text-sm transition border border-[#002175]"
          >
            View Incidents for this Agent
          </button>
        </div>
      </div>
    </>
  );
};
