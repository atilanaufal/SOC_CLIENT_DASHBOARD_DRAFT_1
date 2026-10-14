'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineXMark, HiOutlineCalculator, HiOutlineInformationCircle } from 'react-icons/hi2';

interface RiskScoreFormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RiskScoreFormulaModal: React.FC<RiskScoreFormulaModalProps> = ({ isOpen, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/95 backdrop-blur-2xl rounded-2xl border border-white/80 max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 text-gray-900 animate-in zoom-in-95 duration-150 cursor-default shadow-[0_20px_50px_rgba(0,43,154,0.18),inset_0_1px_2px_rgba(255,255,255,0.95)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200/80">
          <div className="flex items-center gap-2.5 font-bold text-base sm:text-lg text-[#002B9A]">
            <div className="p-1.5 rounded-lg bg-[#002B9A]/10 text-[#002B9A]">
              <HiOutlineCalculator className="w-5 h-5" />
            </div>
            <span>Risk Score Calculation Details</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition"
            aria-label="Close modal"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-xs sm:text-sm">
          {/* Section 1: Tenant Risk Score */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 space-y-2.5">
            <div className="font-extrabold text-xs uppercase tracking-wider text-[#002B9A] flex items-center gap-1.5">
              <span>1. Tenant Risk Score Formula</span>
            </div>
            <div className="bg-white py-2.5 px-4 rounded-lg border border-[#002B9A]/20 flex items-center justify-center gap-2.5 font-mono text-[#002B9A] shadow-sm">
              <span className="font-black text-xs sm:text-sm">RiskScore =</span>
              <div className="inline-flex flex-col items-center">
                <span className="border-b-2 border-[#002B9A]/40 px-2 pb-0.5 text-xs font-bold leading-none">
                  AS₁ + AS₂ + ... + ASₙ
                </span>
                <span className="pt-1 text-[10.5px] font-semibold text-gray-600 leading-none">
                  Total Registered Agents
                </span>
              </div>
            </div>
            <p className="text-gray-600 text-xs leading-relaxed">
              Sum of all <strong>Agent Scores (AS)</strong> divided by the <strong>Total Registered Agents</strong> on this tenant.
            </p>
          </div>

          {/* Section 2: Agent Risk Score */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-gray-200 space-y-2.5">
            <div className="font-extrabold text-xs uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
              <span>2. Agent Risk Score Formula (AS)</span>
            </div>
            <div className="bg-white py-2.5 px-4 rounded-lg border border-gray-300 text-center font-mono text-gray-900 font-bold text-xs shadow-sm">
              AgentScore(e) = min(100, ∑ SeverityWeight)
            </div>
            <p className="text-gray-600 text-xs leading-relaxed">
              Accumulated severity weight of all detected alert events on the specific host/agent, capped at maximum 100.
            </p>

            {/* Severity Weights Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100/90 text-gray-600 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 px-3 border-b border-gray-200">Wazuh Rule Level</th>
                    <th className="py-2 px-3 border-b border-gray-200">Severity Bucket</th>
                    <th className="py-2 px-3 border-b border-gray-200 text-right">Score Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                  <tr className="hover:bg-rose-50/50">
                    <td className="py-1.5 px-3 font-mono">Level 15+</td>
                    <td className="py-1.5 px-3">
                      <span className="bg-[#B8251B] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                        Critical
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-black text-[#B8251B] font-mono">+6</td>
                  </tr>
                  <tr className="hover:bg-orange-50/50">
                    <td className="py-1.5 px-3 font-mono">Level 12 - 14</td>
                    <td className="py-1.5 px-3">
                      <span className="bg-[#EA580C] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                        High
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-black text-[#EA580C] font-mono">+3</td>
                  </tr>
                  <tr className="hover:bg-blue-50/50">
                    <td className="py-1.5 px-3 font-mono">Level 7 - 11</td>
                    <td className="py-1.5 px-3">
                      <span className="bg-[#5B9BD5] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                        Medium
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-black text-[#002B9A] font-mono">+1</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Risk Level Scale */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
            <div className="font-extrabold text-xs uppercase tracking-wider text-gray-800">
              3. Risk Scale Categorization
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-[#16A34A]/10 border border-[#16A34A]/30 p-2 rounded-lg text-[#16A34A] font-bold">
                <div className="font-black text-sm">Low</div>
                <div className="text-[11px] opacity-90">0 – 39</div>
              </div>
              <div className="bg-[#5B9BD5]/15 border border-[#5B9BD5]/30 p-2 rounded-lg text-[#002B9A] font-bold">
                <div className="font-black text-sm">Medium</div>
                <div className="text-[11px] opacity-90">40 – 59</div>
              </div>
              <div className="bg-[#EA580C]/10 border border-[#EA580C]/30 p-2 rounded-lg text-[#EA580C] font-bold">
                <div className="font-black text-sm">High</div>
                <div className="text-[11px] opacity-90">60 – 79</div>
              </div>
              <div className="bg-[#B8251B]/10 border border-[#B8251B]/30 p-2 rounded-lg text-[#B8251B] font-bold">
                <div className="font-black text-sm">Critical</div>
                <div className="text-[11px] opacity-90">80 – 100</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#002B9A] hover:bg-[#002175] text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
