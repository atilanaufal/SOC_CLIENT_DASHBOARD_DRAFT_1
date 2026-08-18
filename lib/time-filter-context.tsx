'use client';

import React, { createContext, useContext, useState } from 'react';

export type TimeFilterOption = 'Today' | 'This Week' | 'This Month' | 'Custom';

export interface CustomDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface TimeFilterMetrics {
  totalSeverity: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lastPeriodCount: number;
  periodLabel: string;

  // Breakdown items in Total Severity
  criticalPrev: number;
  criticalDelta: number;
  highPrev: number;
  highDelta: number;
  mediumPrev: number;
  mediumDelta: number;

  // Incidents Page KPI Metrics
  incidentsCritical: number;
  incidentsCriticalDelta: number;
  incidentsCriticalTrendText: number;

  incidentsHigh: number;
  incidentsHighDelta: number;
  incidentsHighTrendText: number;

  incidentsMedium: number;
  incidentsMediumDelta: number;
  incidentsMediumTrendText: number;

  // Vulnerabilities Page Metrics
  vulnTotal: number;
  vulnCritical: number;
  vulnHigh: number;
  vulnMedium: number;
  vulnPatched: number;

  // Risk Score Metrics
  riskScore: number;
  riskLastMonth: number;

  // Top Incident & Recommended Action Time Metrics
  topIncidentCount: number;
  topIncidentTime: string;
  recommendedActionDate: string;
  recommendedActionTime: string;
  recommendedActionRelTime: string;
}

const DEFAULT_METRICS: TimeFilterMetrics = {
  totalSeverity: 0,
  criticalCount: 0,
  highCount: 0,
  mediumCount: 0,
  lastPeriodCount: 0,
  periodLabel: 'PREVIOUS PERIOD',

  criticalPrev: 0,
  criticalDelta: 0,
  highPrev: 0,
  highDelta: 0,
  mediumPrev: 0,
  mediumDelta: 0,

  incidentsCritical: 0,
  incidentsCriticalDelta: 0,
  incidentsCriticalTrendText: 0,

  incidentsHigh: 0,
  incidentsHighDelta: 0,
  incidentsHighTrendText: 0,

  incidentsMedium: 0,
  incidentsMediumDelta: 0,
  incidentsMediumTrendText: 0,

  vulnTotal: 0,
  vulnCritical: 0,
  vulnHigh: 0,
  vulnMedium: 0,
  vulnPatched: 0,

  riskScore: 0,
  riskLastMonth: 0,

  topIncidentCount: 0,
  topIncidentTime: 'N/A',
  recommendedActionDate: 'N/A',
  recommendedActionTime: 'N/A',
  recommendedActionRelTime: 'N/A',
};

const TIME_METRICS_DATA: Record<string, TimeFilterMetrics> = {
  Today: { ...DEFAULT_METRICS, periodLabel: 'YESTERDAY' },
  'This Week': { ...DEFAULT_METRICS, periodLabel: 'LAST WEEK' },
  'This Month': { ...DEFAULT_METRICS, periodLabel: 'LAST MONTH' },
  Custom: { ...DEFAULT_METRICS, periodLabel: 'PREVIOUS PERIOD' },
};

function formatCustomLabel(range: CustomDateRange | null): string {
  if (!range || !range.startDate || !range.endDate) return 'Custom';
  try {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const startParts = range.startDate.split('-');
    const endParts = range.endDate.split('-');

    if (startParts.length === 3 && endParts.length === 3) {
      const sDay = parseInt(startParts[2], 10);
      const sMonth = months[parseInt(startParts[1], 10) - 1];
      const eDay = parseInt(endParts[2], 10);
      const eMonth = months[parseInt(endParts[1], 10) - 1];

      if (startParts[0] === endParts[0]) {
        // Same year
        return `${sDay} ${sMonth} - ${eDay} ${eMonth}`;
      }
      return `${sDay} ${sMonth} ${startParts[0]} - ${eDay} ${eMonth} ${endParts[0]}`;
    }
  } catch {
    // fallback
  }
  return `${range.startDate} - ${range.endDate}`;
}

interface TimeFilterContextType {
  timeFilter: TimeFilterOption;
  customRange: CustomDateRange | null;
  setTimeFilter: (filter: TimeFilterOption, range?: CustomDateRange | null) => void;
  metrics: TimeFilterMetrics;
  filterLabel: string;
}

const TimeFilterContext = createContext<TimeFilterContextType | undefined>(undefined);

export const TimeFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [timeFilter, setTimeFilterState] = useState<TimeFilterOption>('Today');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);

  const setTimeFilter = (filter: TimeFilterOption, range?: CustomDateRange | null) => {
    setTimeFilterState(filter);
    if (filter === 'Custom' && range) {
      setCustomRange(range);
    } else if (filter !== 'Custom') {
      setCustomRange(null);
    }
  };

  const filterLabel = timeFilter === 'Custom' ? formatCustomLabel(customRange) : timeFilter;
  const metrics = TIME_METRICS_DATA[timeFilter] || DEFAULT_METRICS;

  return (
    <TimeFilterContext.Provider value={{ timeFilter, customRange, setTimeFilter, metrics, filterLabel }}>
      {children}
    </TimeFilterContext.Provider>
  );
};

export const useTimeFilter = () => {
  const context = useContext(TimeFilterContext);
  if (!context) {
    throw new Error('useTimeFilter must be used within a TimeFilterProvider');
  }
  return context;
};

