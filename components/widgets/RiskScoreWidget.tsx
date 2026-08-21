'use client';

import React from 'react';
import { HiOutlineArrowUp, HiOutlineArrowDown, HiOutlineMinus } from 'react-icons/hi2';
import { getRiskCategory, RISK_CATEGORIES } from '@/lib/risk-score';

interface RiskScoreWidgetProps {
  score?: number;
  lastMonthScore?: number;
  periodLabel?: string;
}

const CATEGORY_STYLES: Record<string, {
  activeBg: string;
  activeBorder: string;
  inactiveBg: string;
  inactiveText: string;
  inactiveBorder: string;
  color: string;
}> = {
  low: {
    activeBg: 'bg-emerald-600',
    activeBorder: 'border-emerald-700',
    inactiveBg: 'bg-emerald-50/80',
    inactiveText: 'text-emerald-800',
    inactiveBorder: 'border-emerald-200',
    color: '#22C55E',
  },
  moderate: {
    activeBg: 'bg-amber-500',
    activeBorder: 'border-yellow-600',
    inactiveBg: 'bg-amber-50/80',
    inactiveText: 'text-amber-800',
    inactiveBorder: 'border-amber-200',
    color: '#EAB308',
  },
  elevated: {
    activeBg: 'bg-orange-500',
    activeBorder: 'border-orange-600',
    inactiveBg: 'bg-orange-50/80',
    inactiveText: 'text-orange-800',
    inactiveBorder: 'border-orange-200',
    color: '#F97316',
  },
  high: {
    activeBg: 'bg-red-600',
    activeBorder: 'border-red-700',
    inactiveBg: 'bg-red-50/80',
    inactiveText: 'text-red-800',
    inactiveBorder: 'border-red-200',
    color: '#EF4444',
  },
  critical: {
    activeBg: 'bg-rose-900',
    activeBorder: 'border-rose-950',
    inactiveBg: 'bg-rose-50/80',
    inactiveText: 'text-rose-900',
    inactiveBorder: 'border-rose-200',
    color: '#991B1B',
  },
};

export const RiskScoreWidget: React.FC<RiskScoreWidgetProps> = ({
  score = 0,
  lastMonthScore = 0,
  periodLabel = 'YESTERDAY',
}) => {
  const radius = 40;
  const circumference = Math.PI * radius;
  const fillRatio = Math.min(Math.max(score, 0), 100) / 100;
  const fillLength = fillRatio * circumference;

  const diff = score - lastMonthScore;
  const percentage = lastMonthScore > 0 ? Math.round((diff / lastMonthScore) * 100) : 0;
  const isUp = diff > 0;
  const isDown = diff < 0;

  const currentCategory = getRiskCategory(score);

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] overflow-hidden flex flex-col h-full">
      {/* Top Navy Header */}
      <div className="bg-[#002B9A]/95 backdrop-blur-md text-white font-black px-4 py-2.5 text-center text-base tracking-wide flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
        Risk Score
      </div>

      {/* Content Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-start gap-3 items-center text-center">
        {/* SVG Arc Gauge */}
        <div className="w-full flex justify-center py-0.5">
          <div className="relative w-48 h-25 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 70">
              {/* Track */}
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="11"
                strokeLinecap="round"
              />

              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22C55E" />
                  <stop offset="25%" stopColor="#EAB308" />
                  <stop offset="50%" stopColor="#F97316" />
                  <stop offset="75%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#991B1B" />
                </linearGradient>
              </defs>

              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="url(#scoreGradient)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${fillLength} ${circumference}`}
                className="transition-all duration-500 ease-out"
              />

              <text
                x="50"
                y="48"
                textAnchor="middle"
                className="text-[22px] font-black fill-gray-900"
              >
                {typeof score === 'number' ? (Number.isInteger(score) ? score : Number(score.toFixed(1))) : score}
              </text>
              <text
                x="50"
                y="62"
                textAnchor="middle"
                className="text-[9px] font-extrabold fill-gray-500 uppercase tracking-wider"
              >
                {currentCategory.label}
              </text>
            </svg>
          </div>
        </div>

        {/* Dynamic Period Label Panel */}
        <div className="w-full bg-white/65 backdrop-blur-md text-gray-900 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.02)]">
          <span className="text-gray-700 font-extrabold text-xs">
            {periodLabel}: <strong className="text-gray-900 text-sm">{lastMonthScore}</strong>
          </span>
          {isUp ? (
            <span className="bg-red-50/80 backdrop-blur-sm text-red-600 border border-red-200 font-black px-2.5 py-0.5 rounded-md text-xs flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
              <HiOutlineArrowUp className="w-3.5 h-3.5 stroke-[3]" /> +{diff} ({percentage}%)
            </span>
          ) : isDown ? (
            <span className="bg-emerald-50/80 backdrop-blur-sm text-emerald-600 border border-emerald-200 font-black px-2.5 py-0.5 rounded-md text-xs flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
              <HiOutlineArrowDown className="w-3.5 h-3.5 stroke-[3]" /> {diff} ({percentage}%)
            </span>
          ) : (
            <span className="bg-gray-100/80 backdrop-blur-sm text-gray-700 border border-gray-200 font-black px-2.5 py-0.5 rounded-md text-xs flex items-center gap-1">
              <HiOutlineMinus className="w-3.5 h-3.5 stroke-[3]" /> 0 (0%)
            </span>
          )}
        </div>

        {/* Risk Scale (5 Categories) */}
        <div className="w-full flex gap-3 items-stretch border-t border-gray-200/50 pt-2.5">
          <div className="w-2.5 rounded-md bg-gradient-to-b from-[#22C55E] via-[#EAB308] via-[#F97316] via-[#EF4444] to-[#991B1B] flex-shrink-0" />

          <div className="flex-1 space-y-1 text-xs font-black">
            {RISK_CATEGORIES.map((cat) => {
              const isActive = currentCategory.key === cat.key;
              const styleConfig = CATEGORY_STYLES[cat.key] || CATEGORY_STYLES.low;
              return (
                <div
                  key={cat.key}
                  style={isActive ? { backgroundColor: styleConfig.color, borderColor: styleConfig.color, color: '#ffffff' } : undefined}
                  className={`py-1.5 px-3 rounded-md transition-all border ${
                    isActive
                      ? `${styleConfig.activeBg} text-white font-black ${styleConfig.activeBorder} scale-[1.02] opacity-100`
                      : `${styleConfig.inactiveBg} ${styleConfig.inactiveText} ${styleConfig.inactiveBorder} opacity-60`
                  }`}
                  title={cat.meaning}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-current">{cat.label}</span>
                    <span className="font-bold text-[10px] opacity-90 text-current">{cat.range}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
