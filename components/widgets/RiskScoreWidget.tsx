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
  const isUp = diff > 0;
  const isDown = diff < 0;

  const currentCategory = getRiskCategory(score);

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] overflow-hidden flex flex-col h-full justify-between">
      {/* Top Navy Header - Standardized Height */}
      <div className="h-11 sm:h-12 md:h-12 xl:h-13 bg-[#002B9A]/95 backdrop-blur-md text-white font-black px-4 sm:px-4.5 xl:px-5 2xl:px-6 flex items-center text-xs sm:text-sm md:text-sm xl:text-base tracking-wide flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
        Risk Score
      </div>

      {/* Content Body */}
      <div className="p-3.5 sm:p-4 xl:p-4.5 2xl:p-5 flex-1 flex flex-col justify-start gap-3 sm:gap-3.5 md:gap-4 xl:gap-4.5 items-center text-center">
        {/* SVG Arc Gauge */}
        <div className="w-full flex justify-center py-1">
          <div className="relative w-44 sm:w-48 md:w-48 xl:w-56 2xl:w-64 h-22 sm:h-24 md:h-24 xl:h-28 2xl:h-32 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 58">
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
            </svg>

            {/* Matching Font Size HTML Center Overlay - Number Only */}
            <div className="absolute inset-0 flex items-end justify-center pb-1.5 sm:pb-2 xl:pb-2.5 text-center pointer-events-none">
              <span className="text-3xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-gray-900 leading-none tracking-tight">
                {typeof score === 'number' ? (Number.isInteger(score) ? score : Number(score.toFixed(1))) : score}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Period Label Panel */}
        <div className="w-full bg-white/75 backdrop-blur-md text-gray-900 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-between border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.02)]">
          <span className="text-gray-700 font-extrabold text-xs sm:text-sm">
            {periodLabel}: <strong className="text-gray-900 text-sm sm:text-base font-black">{lastMonthScore}</strong>
          </span>
          {isUp ? (
            <span className="bg-red-50/90 backdrop-blur-sm text-red-600 border border-red-200 font-black px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
              <HiOutlineArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> +{diff}
            </span>
          ) : isDown ? (
            <span className="bg-emerald-50/90 backdrop-blur-sm text-emerald-600 border border-emerald-200 font-black px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
              <HiOutlineArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> {diff}
            </span>
          ) : (
            <span className="bg-gray-100/90 backdrop-blur-sm text-gray-700 border border-gray-200 font-black px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm flex items-center gap-1">
              <HiOutlineMinus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> 0
            </span>
          )}
        </div>

        {/* Risk Scale (5 Categories) */}
        <div className="w-full flex gap-2.5 sm:gap-3 2xl:gap-4 items-stretch border-t border-gray-200/60 pt-2.5 sm:pt-3">
          <div className="w-2.5 sm:w-3 xl:w-3.5 rounded-md bg-gradient-to-b from-[#22C55E] via-[#EAB308] via-[#F97316] via-[#EF4444] to-[#991B1B] flex-shrink-0" />

          <div className="flex-1 space-y-1.5 sm:space-y-1.5 xl:space-y-2 text-xs sm:text-sm font-black">
            {RISK_CATEGORIES.map((cat) => {
              const isActive = currentCategory.key === cat.key;
              const styleConfig = CATEGORY_STYLES[cat.key] || CATEGORY_STYLES.low;
              return (
                <div
                  key={cat.key}
                  style={isActive ? { backgroundColor: styleConfig.color, borderColor: styleConfig.color, color: '#ffffff' } : undefined}
                  className={`py-1.5 sm:py-2 px-3 sm:px-3.5 rounded-lg transition-all border ${
                    isActive
                      ? `${styleConfig.activeBg} text-white font-black ${styleConfig.activeBorder} scale-[1.02] opacity-100 shadow-sm`
                      : `${styleConfig.inactiveBg} ${styleConfig.inactiveText} ${styleConfig.inactiveBorder} opacity-65`
                  }`}
                  title={cat.meaning}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs sm:text-sm text-current">{cat.label}</span>
                    <span className="font-bold text-[11px] sm:text-xs opacity-90 text-current">{cat.range}</span>
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
