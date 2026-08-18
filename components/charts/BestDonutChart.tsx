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
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (100 - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  // Scale center label font size with chart size
  const fontSizeClass =
    size >= 140
      ? 'text-3xl font-black'
      : size >= 100
      ? 'text-2xl font-black'
      : 'text-lg font-black';

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Track background */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="#f1f5f9"
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
