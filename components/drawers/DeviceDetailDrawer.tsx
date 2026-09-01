'use client';

import React, { useState, useEffect } from 'react';
import { Device } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { HiOutlineXMark, HiOutlineArrowPath, HiOutlineServerStack } from 'react-icons/hi2';
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
        className="lg:hidden fixed inset-0 bg-slate-950/30 backdrop-blur-sm z-40 animate-in fade-in duration-150 cursor-pointer"
      />

      {/* Slide-out Drawer Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 lg:z-30 lg:inset-auto lg:top-[84px] lg:bottom-3.5 lg:right-6 w-full max-w-full sm:max-w-md lg:max-w-none lg:w-[390px] xl:w-[430px] 2xl:w-[480px] bg-white/90 backdrop-blur-2xl border-l border-white/80 lg:border lg:border-white/80 rounded-none lg:rounded-xl shadow-[-12px_0_40px_rgba(0,43,154,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)] flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200/60 px-4 sm:px-5 xl:px-6 py-3.5 xl:py-4 flex-shrink-0 bg-white/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <h3 className="text-base sm:text-lg xl:text-xl font-bold text-gray-900 tracking-tight">Device Details</h3>
          <button
            onClick={onClose}
            className="text-gray-700 font-bold hover:text-gray-900 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
            aria-label="Close device details"
          >
            <HiOutlineXMark className="w-5 h-5 xl:w-6 xl:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 xl:p-6 space-y-4 xl:space-y-5 text-gray-900">
          {/* Agent Name & Agent ID side-by-side */}
          <div className="bg-white/80 backdrop-blur-sm p-3.5 xl:p-4 rounded-xl border border-gray-200/80 shadow-sm">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1">Agent Information</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base sm:text-lg xl:text-xl font-black text-[#002B9A] break-all">{device.agent}</span>
              <span className="bg-[#002B9A] text-white text-xs xl:text-sm font-bold px-2.5 xl:px-3 py-1 rounded-lg flex-shrink-0">
                ID: {device.id}
              </span>
            </div>
          </div>

          {/* Status & Last Seen Aligned Side-by-Side */}
          <div className="pt-1">
            <div className="grid grid-cols-2 gap-2 text-xs xl:text-sm bg-white/80 backdrop-blur-sm p-3.5 xl:p-4 rounded-xl border border-gray-200/80 shadow-sm">
              <div>
                <p className="text-gray-500 font-bold mb-1 uppercase tracking-wider text-xs">Status</p>
                <span
                  className={`inline-block px-2.5 xl:px-3 py-1 rounded-lg text-xs sm:text-sm font-bold ${
                    device.status === 'Online'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  {device.status}
                </span>
              </div>

              <div>
                <p className="text-gray-500 font-bold mb-0.5 uppercase tracking-wider text-xs">Last Seen</p>
                <div className="flex flex-col leading-tight">
                  <span className="font-bold text-gray-900 text-xs sm:text-sm">{lastSeenDateStr}</span>
                  {lastSeenAgoStr ? <span className="text-xs text-gray-500 font-medium">{lastSeenAgoStr}</span> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Agent Risk Score Section */}
          <div className="pt-2 border-t border-gray-200/80">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1.5">Agent Risk Score</p>
            <div className="bg-white/80 backdrop-blur-sm p-3.5 xl:p-4 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-gray-900">{scoreVal}</span>
                  <span className="text-xs sm:text-sm text-gray-500 font-semibold">/ 100</span>
                </div>
                <p className="text-xs text-gray-500 font-medium mt-0.5">{currentCat.meaning}</p>
              </div>
              <span
                style={{ backgroundColor: currentCat.color }}
                className="text-white font-bold px-3 xl:px-4 py-1 xl:py-1.5 rounded-lg text-xs sm:text-sm tracking-wide"
              >
                {currentCat.label}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200/80">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-0.5">Operating System</p>
            <p className="text-sm sm:text-base font-bold text-gray-900">{device.os}</p>
          </div>

          {/* System Specifications */}
          <div className="pt-2 border-t border-gray-200/80">
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider">System Specifications</p>
              {loadingHw && <HiOutlineArrowPath className="w-4 h-4 animate-spin text-[#002B9A]" />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs xl:text-sm bg-white/80 backdrop-blur-sm p-3.5 xl:p-4 rounded-xl border border-gray-200/80 shadow-sm">
              <div className="col-span-3 pb-1.5 border-b border-gray-200/80">
                <p className="text-gray-500 font-semibold text-xs">CPU Model</p>
                <p className="font-bold text-gray-900 text-xs sm:text-sm truncate" title={hardware?.cpuName || device.cpu || 'N/A'}>
                  {hardware?.cpuName || device.cpu || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 font-semibold text-xs">Cores</p>
                <p className="font-bold text-gray-900 text-xs sm:text-sm">{hardware?.cores || device.cores || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500 font-semibold text-xs">RAM Total</p>
                <p className="font-bold text-gray-900 text-xs sm:text-sm">{hardware?.ramTotal || device.ram || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Installed Agent Metadata & Registration Date */}
          <div className="pt-2 border-t border-gray-200/80">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1.5">Installed Agent Metadata</p>
            <div className="grid grid-cols-2 gap-2 text-xs xl:text-sm bg-white/80 backdrop-blur-sm p-3.5 xl:p-4 rounded-xl border border-gray-200/80 shadow-sm">
              <div>
                <p className="text-gray-500 font-semibold text-xs">Wazuh Version</p>
                <p className="font-bold text-gray-900 text-xs sm:text-sm">{device.agentVersion || 'Wazuh Agent'}</p>
              </div>
              <div>
                <p className="text-gray-500 font-semibold text-xs">IP Address</p>
                <p className="font-bold text-[#002B9A] text-xs sm:text-sm">{device.ipAddress || 'N/A'}</p>
              </div>
              <div className="col-span-2 pt-1.5 border-t border-gray-200/80">
                <p className="text-gray-500 font-semibold text-xs">Registration Date</p>
                <p className="font-bold text-gray-900 text-xs sm:text-sm">
                  {(device as any).registrationDate || (device as any).dateAdd || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Detected Issues Section */}
          <div className="pt-2 border-t border-gray-200/80">
            <p className="font-bold text-xs xl:text-sm text-gray-500 uppercase tracking-wider mb-1.5">Detected Issues</p>
            {(!device.detectedIssues || device.detectedIssues.length === 0) ? (
              <p className="text-xs sm:text-sm text-gray-500 italic">No critical incident issues detected on this agent.</p>
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
                    <ul className="list-disc pl-4 text-xs sm:text-sm space-y-1">
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
                                ? 'bg-red-100 text-red-800 font-bold p-1.5 px-2.5 rounded-lg border border-red-300 list-none'
                                : 'font-medium text-gray-800'
                            }
                          >
                            {issue}
                          </li>
                        );
                      })}
                    </ul>
                    {remaining > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs px-2.5 py-0.5 rounded-md">
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

        <div className="p-4 xl:p-5 border-t border-gray-200 flex-shrink-0 bg-white/70 backdrop-blur-sm">
          <button
            onClick={() => {
              onClose();
              router.push(`/incidents?agent=${encodeURIComponent(device.agent)}`);
            }}
            className="w-full bg-[#002B9A] hover:bg-[#002175] text-white font-bold py-2.5 sm:py-3 xl:py-3.5 rounded-xl text-xs sm:text-sm xl:text-base 2xl:text-lg transition border border-[#002175] cursor-pointer shadow-sm"
          >
            View Incidents for this Agent
          </button>
        </div>
      </div>
    </>
  );
};
