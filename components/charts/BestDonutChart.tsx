'use client';

import React from 'react';

export interface Segment {
  label: string;
  value: number;
  color: string;
}

interface BestDonutChartProps {
  segments?: Segment[];
  centerLabel: string;
  size?: number;
  strokeWidth?: number;
  customFontSizeClass?: string;
}

export const BestDonutChart: React.FC<BestDonutChartProps> = ({
  segments = [
    { label: 'Ubuntu', value: 40, color: '#3B82F6' },
    { label: 'Win 11', value: 35, color: '#A855F7' },
    { label: 'FreeBSD', value: 30, color: '#F97316' },
    { label: 'Fedora', value: 25, color: '#10B981' },
    { label: 'CentOS', value: 20, color: '#F59E0B' },
  ],
  centerLabel,
  size = 130,
  strokeWidth = 14,
  customFontSizeClass,
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (100 - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  // Scale center label font size across sm, md, lg, xl, 2xl
  const fontSizeClass =
    customFontSizeClass ||
    (size >= 140
      ? 'text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black'
      : size >= 100
      ? 'text-xl sm:text-2xl md:text-2xl xl:text-3xl 2xl:text-4xl font-black'
      : 'text-base sm:text-lg md:text-lg xl:text-xl 2xl:text-2xl font-black');

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Track background */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={total === 0 ? "#cbd5e1" : "#e2e8f0"}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Dynamic Segments */}
        {segments.map((seg, idx) => {
          const ratio = total > 0 ? seg.value / total : 0;
          const strokeDasharray = ratio * circumference;
          const strokeDashoffset = -currentOffset;
          if (total > 0) {
            currentOffset += strokeDasharray;
          }

          return (
            <circle
              key={idx}
              cx="50"
              cy="50"
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeDasharray} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              fill="none"
              className="transition-all duration-300"
            />
          );
        })}
      </svg>

      {/* Centered number scaled font size */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1">
        <span className={`${fontSizeClass} text-gray-900 leading-none tracking-tight`}>
          {centerLabel}
        </span>
      </div>
    </div>
  );
};
