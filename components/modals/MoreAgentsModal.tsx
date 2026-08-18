'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { HiOutlineXMark, HiOutlineServer } from 'react-icons/hi2';

interface MoreAgentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents?: string[];
  incidentName?: string;
}

export const MoreAgentsModal: React.FC<MoreAgentsModalProps> = ({
  isOpen,
  onClose,
  agents = [],
  incidentName = '',
}) => {
  const router = useRouter();

  if (!isOpen) return null;

  const handleAgentClick = (agentName: string) => {
    onClose();
    const query = incidentName
      ? `/devices?search=${encodeURIComponent(agentName)}&highlight=${encodeURIComponent(incidentName)}`
      : `/devices?search=${encodeURIComponent(agentName)}`;
    router.push(query);
  };

  const displayedAgents = agents;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 backdrop-blur-xs">
      <div className="bg-white rounded-xl border border-gray-200 max-w-md w-full overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-navy-800 font-extrabold text-base">
            <HiOutlineServer className="w-5 h-5 text-blue-700" />
            <span>Associated Agents</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 p-1 rounded-lg transition"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3">
          {incidentName && (
            <p className="text-xs font-black text-red-600 bg-red-50 p-2 rounded-md border border-red-200 truncate">
              Incident: {incidentName}
            </p>
          )}
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Select an agent to view device details:
          </p>

          <div className="flex flex-wrap gap-2">
            {displayedAgents.map((agentName, idx) => (
              <button
                key={idx}
                onClick={() => handleAgentClick(agentName)}
                className="bg-blue-50 hover:bg-navy-800 hover:text-white text-navy-800 font-extrabold text-xs px-3 py-1.5 rounded-md border border-blue-200 transition flex items-center gap-1.5"
              >
                <HiOutlineServer className="w-3.5 h-3.5" />
                <span>{agentName}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
