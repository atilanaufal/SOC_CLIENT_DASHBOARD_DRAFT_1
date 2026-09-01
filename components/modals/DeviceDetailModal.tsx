'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Device } from '@/lib/types';

import { useRouter } from 'next/navigation';

interface DeviceDetailModalProps {
  device: Device | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceDetailModal: React.FC<DeviceDetailModalProps> = ({
  device,
  isOpen,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !device) return null;

  const handleViewIncident = () => {
    onClose();
    router.push('/incidents');
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#edf2f7] backdrop-blur-xl rounded-md max-w-xl w-full overflow-hidden border border-gray-300 cursor-default"
      >
        {/* Navy Header */}
        <div className="bg-[#002B9A] text-white px-6 py-3.5 flex items-center justify-between">
          <h3 className="text-2xl font-bold">Device Details</h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 font-bold text-2xl px-2"
          >
            X
          </button>
        </div>

        {/* Details Grid */}
        <div className="p-6 space-y-6 text-gray-900">
          {/* Row 1 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="font-bold text-base">Agent</p>
              <p className="text-sm font-semibold text-gray-800">{device.agent}</p>
            </div>
            <div>
              <p className="font-bold text-base">Operating System</p>
              <p className="text-sm font-semibold text-gray-800">{device.os}</p>
            </div>
            <div>
              <p className="font-bold text-base">Status</p>
              <p className="text-sm font-semibold text-gray-800">{device.status}</p>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="font-bold text-base">CPU</p>
              <p className="text-sm font-semibold text-gray-800">{device.cpu || 'Amd Ryzen 7 9800X'}</p>
            </div>
            <div>
              <p className="font-bold text-base">Cores</p>
              <p className="text-sm font-semibold text-gray-800">{device.cores || '12 Cores'}</p>
            </div>
            <div>
              <p className="font-bold text-base">Ram</p>
              <p className="text-sm font-semibold text-gray-800">{device.ram || '128Gb'}</p>
            </div>
          </div>

          {/* Asset Info */}
          <div>
            <h4 className="font-bold text-lg mb-2">Asset Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-bold text-base">University</p>
                <p className="text-sm font-semibold text-gray-800">{device.university || 'Swiss German University'}</p>
              </div>
              <div>
                <p className="font-bold text-base">Tenant</p>
                <p className="text-sm font-semibold text-gray-800">{device.tenant || 'Cyber Lab Head Office'}</p>
              </div>
            </div>
          </div>

          {/* Installed Agent */}
          <div>
            <h4 className="font-bold text-lg mb-2">Installed Agent</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="font-bold text-base">Version</p>
                <p className="text-sm font-semibold text-gray-800">{device.agentVersion || '4.14.6'}</p>
              </div>
              <div>
                <p className="font-bold text-base">IP Address</p>
                <p className="text-sm font-semibold text-gray-800">{device.ipAddress || '192.168.100.10'}</p>
              </div>
              <div>
                <p className="font-bold text-base">Last Seen</p>
                <p className="text-sm font-semibold text-gray-800">{device.lastSeen}</p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2 text-center">
            <button
              onClick={handleViewIncident}
              className="bg-black hover:bg-zinc-800 text-white font-bold px-8 py-2.5 rounded text-lg transition border border-zinc-800"
            >
              View Incident
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
