'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  HiOutlineChevronDown,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineMinus,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineArrowUpRight,
} from 'react-icons/hi2';
import { BestDonutChart } from '@/components/charts/BestDonutChart';
import { RiskScoreWidget } from '@/components/widgets/RiskScoreWidget';
import { MoreAgentsModal } from '@/components/modals/MoreAgentsModal';
import { useTimeFilter } from '@/lib/time-filter-context';
import { fetchDashboardStats } from '@/lib/api-client';

export default function DashboardPage() {
  const router = useRouter();
  const { timeFilter, customRange } = useTimeFilter();

  const [statsData, setStatsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Top Incident Severity Filter Dropdown state
  const [severityFilter, setSeverityFilter] = useState<'Critical' | 'High' | 'Medium'>('Critical');
  const [isSeverityDropdownOpen, setIsSeverityDropdownOpen] = useState(false);
  const [severityCoords, setSeverityCoords] = useState<{ top: number; right: number } | null>(null);
  const severityButtonRef = useRef<HTMLButtonElement>(null);
  const severityDropdownRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // More Agents Modal State
  const [isMoreAgentsOpen, setIsMoreAgentsOpen] = useState(false);
  const [selectedMoreAgentsIncident, setSelectedMoreAgentsIncident] = useState<any | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateSeverityPosition = () => {
    if (severityButtonRef.current) {
      const rect = severityButtonRef.current.getBoundingClientRect();
      setSeverityCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  };

  useEffect(() => {
    if (isSeverityDropdownOpen) {
      updateSeverityPosition();
      window.addEventListener('resize', updateSeverityPosition);
      window.addEventListener('scroll', updateSeverityPosition);
      return () => {
        window.removeEventListener('resize', updateSeverityPosition);
        window.removeEventListener('scroll', updateSeverityPosition);
      };
    }
  }, [isSeverityDropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        severityDropdownRef.current &&
        !severityDropdownRef.current.contains(event.target as Node) &&
        severityButtonRef.current &&
        !severityButtonRef.current.contains(event.target as Node)
      ) {
        setIsSeverityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch live metrics strictly based on active Time Filter and Custom Range
  useEffect(() => {
    async function loadStats() {
      try {
        setIsLoading(true);
        const data = await fetchDashboardStats(timeFilter, customRange);
        setStatsData(data);

        // Auto fallback if no critical incidents exist
        if (data?.topIncidents?.length) {
          const hasCritical = data.topIncidents.some((inc: any) => String(inc.severity).toLowerCase() === 'critical');
          const hasHigh = data.topIncidents.some((inc: any) => String(inc.severity).toLowerCase() === 'high');
          const hasMedium = data.topIncidents.some((inc: any) => String(inc.severity).toLowerCase() === 'medium');
          if (!hasCritical && hasHigh) {
            setSeverityFilter('High');
          } else if (!hasCritical && !hasHigh && hasMedium) {
            setSeverityFilter('Medium');
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard stats from DB:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, [timeFilter, customRange]);

  const handleAgentClick = (agentName: string, incidentName?: string) => {
    const query = incidentName
      ? `/devices?search=${encodeURIComponent(agentName)}&highlight=${encodeURIComponent(incidentName)}`
      : `/devices?search=${encodeURIComponent(agentName)}`;
    router.push(query);
  };

  const handleRecommendedActionView = (reportId: string) => {
    router.push(`/reports?reportId=${encodeURIComponent(reportId)}`);
  };

  // Dynamic period label based on active time filter (updates label text on UI)
  const periodLabel = statsData?.periodLabel || (timeFilter === 'Today' ? 'YESTERDAY' : timeFilter === 'This Week' ? 'LAST WEEK' : 'LAST MONTH');

  // Live Counts & Real Calculated Trends from MongoDB API
  const incStats = statsData?.incidents || {};
  const criticalCount = typeof incStats.critical === 'number' ? incStats.critical : 0;
  const highCount = typeof incStats.high === 'number' ? incStats.high : 0;
  const mediumCount = typeof incStats.medium === 'number' ? incStats.medium : 0;
  const lowCount = typeof incStats.low === 'number' ? incStats.low : 0;
  const totalSeverity = typeof incStats.total === 'number' ? incStats.total : criticalCount + highCount + mediumCount + lowCount;

  const lastPeriodCount = typeof incStats.totalPrev === 'number' ? incStats.totalPrev : 0;
  const totalDelta = typeof incStats.totalDelta === 'number' ? incStats.totalDelta : 0;

  const criticalPrev = typeof incStats.criticalPrev === 'number' ? incStats.criticalPrev : 0;
  const criticalDelta = typeof incStats.criticalDelta === 'number' ? incStats.criticalDelta : 0;

  const highPrev = typeof incStats.highPrev === 'number' ? incStats.highPrev : 0;
  const highDelta = typeof incStats.highDelta === 'number' ? incStats.highDelta : 0;

  const mediumPrev = typeof incStats.mediumPrev === 'number' ? incStats.mediumPrev : 0;
  const mediumDelta = typeof incStats.mediumDelta === 'number' ? incStats.mediumDelta : 0;

  const donutSegments = [
    { label: 'Medium', value: mediumCount, color: '#5B9BD5' },
    { label: 'High', value: highCount, color: '#EA580C' },
    { label: 'Critical', value: criticalCount, color: '#B8251B' },
  ];

  // Top Incidents (Real DB)
  const topIncidentsSource: any[] = useMemo(() => statsData?.topIncidents || [], [statsData]);
  const filteredIncidents = useMemo(() => {
    const targetSev = (severityFilter || '').trim().toLowerCase();
    return topIncidentsSource
      .filter((inc) => String(inc.severity || '').trim().toLowerCase() === targetSev)
      .slice(0, 5);
  }, [topIncidentsSource, severityFilter]);

  // Recommended Actions (Real DB) - Strictly only reports with genuine recommended actions
  const SEVERITY_RANK_MAP: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const rawRecs: any[] = statsData?.recommendedActions || [];
  const recommendedActionsSource = useMemo(() => {
    return [...rawRecs]
      .filter((act) => {
        const text = String(act.action || '').trim();
        return text !== '' && text.toLowerCase() !== 'no recommended action specified.' && text.toLowerCase() !== 'n/a' && text.toLowerCase() !== '-';
      })
      .sort((a, b) => {
        const rankA = SEVERITY_RANK_MAP[String(a.severity || '').toLowerCase()] || 0;
        const rankB = SEVERITY_RANK_MAP[String(b.severity || '').toLowerCase()] || 0;
        if (rankB !== rankA) return rankB - rankA;
        const timeA = a.rawDate ? Number(a.rawDate) : (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.rawDate ? Number(b.rawDate) : (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });
  }, [rawRecs]);

  const renderSeverityBadge = (sev: string) => {
    const s = String(sev || '').toLowerCase();
    if (s === 'critical') return <span className="bg-[#B8251B] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 xl:py-1.5 2xl:py-2 rounded-md min-w-[70px] sm:min-w-[75px] xl:min-w-[85px] 2xl:min-w-[95px] text-center shadow-[0_2px_6px_rgba(184,37,27,0.3)]">Critical</span>;
    if (s === 'high') return <span className="bg-[#EA580C] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 xl:py-1.5 2xl:py-2 rounded-md min-w-[70px] sm:min-w-[75px] xl:min-w-[85px] 2xl:min-w-[95px] text-center shadow-[0_2px_6px_rgba(234,88,12,0.3)]">High</span>;
    if (s === 'medium') return <span className="bg-[#5B9BD5] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 xl:py-1.5 2xl:py-2 rounded-md min-w-[70px] sm:min-w-[75px] xl:min-w-[85px] 2xl:min-w-[95px] text-center shadow-[0_2px_6px_rgba(91,155,213,0.3)]">Medium</span>;
    if (s === 'low') return <span className="bg-[#0066B1] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 xl:py-1.5 2xl:py-2 rounded-md min-w-[70px] sm:min-w-[75px] xl:min-w-[85px] 2xl:min-w-[95px] text-center">Low</span>;
    return <span className="bg-slate-600 text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 xl:py-1.5 2xl:py-2 rounded-md min-w-[70px] sm:min-w-[75px] xl:min-w-[85px] 2xl:min-w-[95px] text-center">Info</span>;
  };

  const renderDeltaBadge = (delta: number) => {
    if (delta > 0) {
      return (
        <span className="bg-red-50/90 text-red-600 border border-red-200 px-2 sm:px-2.5 py-0.5 rounded-md font-black text-[11px] sm:text-xs xl:text-sm flex items-center gap-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <HiOutlineArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> +{delta}
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span className="bg-emerald-50/90 text-emerald-600 border border-emerald-200 px-2 sm:px-2.5 py-0.5 rounded-md font-black text-[11px] sm:text-xs xl:text-sm flex items-center gap-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <HiOutlineArrowDown className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 stroke-[3]" /> {delta}
        </span>
      );
    }
    return (
      <span className="bg-gray-100/90 text-gray-700 border border-gray-200 px-2 sm:px-2.5 py-0.5 rounded-md font-black text-[11px] sm:text-xs xl:text-sm flex items-center gap-0.5">
        <HiOutlineMinus className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" /> 0
      </span>
    );
  };

  const renderTrendComparison = (trend: number) => {
    if (trend > 0) {
      return (
        <div className="flex items-center gap-1 font-black text-red-600">
          <HiOutlineArrowTrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-4.5 xl:h-4.5 text-red-600 stroke-[3]" />
        </div>
      );
    }
    if (trend < 0) {
      return (
        <div className="flex items-center gap-1 font-black text-emerald-600">
          <HiOutlineArrowTrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-4.5 xl:h-4.5 text-emerald-600 stroke-[3]" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 font-black text-gray-400">
        <HiOutlineMinus className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-4.5 xl:h-4.5 text-gray-400 stroke-[3]" />
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-3 sm:gap-3.5 md:gap-4 xl:gap-4.5 2xl:gap-6">
      {/* Top Row: Total Severity | Risk Score | Top Incident */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-3.5 md:gap-4 xl:gap-4.5 2xl:gap-6 items-stretch w-full">
        {/* 1. Total Severity */}
        <div className="md:col-span-1 lg:col-span-4 xl:col-span-4 2xl:col-span-4 bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 flex flex-col justify-between overflow-hidden h-full shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
          <div className="h-11 sm:h-12 md:h-12 xl:h-13 bg-[#002B9A]/95 backdrop-blur-md text-white font-black px-3.5 sm:px-4 md:px-4.5 xl:px-5 2xl:px-6 flex items-center text-xs sm:text-sm md:text-sm xl:text-base flex-shrink-0 border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            Total Severity
          </div>

          <div className="p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-4.5 flex-1 flex flex-col justify-between gap-2 sm:gap-2.5">
            {/* Donut Chart & Previous Period Summary */}
            <div className="flex items-center justify-around py-1">
              <BestDonutChart
                segments={donutSegments}
                centerLabel={totalSeverity.toString()}
                size={145}
                strokeWidth={14}
              />
              <div className="text-center bg-white/65 backdrop-blur-md px-3.5 sm:px-4 md:px-4 xl:px-5 2xl:px-6 py-2 sm:py-2.5 xl:py-3 2xl:py-4 rounded-lg border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_4px_16px_rgba(0,0,0,0.02)] flex flex-col items-center gap-1 min-w-[110px] sm:min-w-[120px] xl:min-w-[135px] 2xl:min-w-[150px]">
                <p className="text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black text-gray-500 uppercase tracking-wider">{periodLabel}</p>
                <div className="flex items-center justify-center gap-1.5 text-gray-900 font-black text-xl sm:text-2xl md:text-2xl xl:text-3xl 2xl:text-4xl my-0.5">
                  <span>{lastPeriodCount}</span>
                </div>
                <div className={`px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-0.5 xl:py-1 2xl:py-1.5 rounded-md font-black text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base border flex items-center gap-1 ${
                  totalDelta > 0
                    ? 'bg-red-50/80 backdrop-blur-sm text-red-600 border-red-200 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
                    : totalDelta < 0
                    ? 'bg-emerald-50/80 backdrop-blur-sm text-emerald-600 border-emerald-200 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]'
                    : 'bg-gray-100/80 backdrop-blur-sm text-gray-700 border-gray-200'
                }`}>
                  {totalDelta > 0 ? (
                    <HiOutlineArrowUp className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                  ) : totalDelta < 0 ? (
                    <HiOutlineArrowDown className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                  ) : (
                    <HiOutlineMinus className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                  )}
                  <span>{totalDelta > 0 ? `+${totalDelta}` : totalDelta}</span>
                </div>
              </div>
            </div>

            {/* Breakdown Cards - Neatly aligned, compact & balanced */}
            <div className="flex flex-col gap-2 sm:gap-2.5 border-t border-gray-200/50 pt-2 sm:pt-2.5">
              {/* Critical Card */}
              <div className="p-1.5 sm:p-2 md:p-2 xl:p-2.5 px-3 sm:px-3.5 md:px-3.5 xl:px-4 rounded-lg bg-white/60 backdrop-blur-md border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] flex items-center justify-between">
                <div>
                  <span className="inline-block bg-[#B8251B] text-white text-[10px] sm:text-xs font-black px-2 sm:px-2.5 py-0.5 rounded shadow-[0_2px_4px_rgba(184,37,27,0.25)] uppercase tracking-wider">
                    Critical
                  </span>
                  <p className="text-lg sm:text-xl xl:text-2xl font-black text-[#B8251B] tracking-tight leading-tight mt-0.5">
                    {criticalCount}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base xl:text-lg font-black text-gray-900">
                  {renderTrendComparison(criticalDelta)}
                  <span>{criticalPrev}</span>
                  <span className="text-gray-400 font-bold">-</span>
                  {renderDeltaBadge(criticalDelta)}
                </div>
              </div>

              {/* High Card */}
              <div className="p-1.5 sm:p-2 md:p-2 xl:p-2.5 px-3 sm:px-3.5 md:px-3.5 xl:px-4 rounded-lg bg-white/60 backdrop-blur-md border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] flex items-center justify-between">
                <div>
                  <span className="inline-block bg-[#EA580C] text-white text-[10px] sm:text-xs font-black px-2 sm:px-2.5 py-0.5 rounded shadow-[0_2px_4px_rgba(234,88,12,0.25)] uppercase tracking-wider">
                    High
                  </span>
                  <p className="text-lg sm:text-xl xl:text-2xl font-black text-[#EA580C] tracking-tight leading-tight mt-0.5">
                    {highCount}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base xl:text-lg font-black text-gray-900">
                  {renderTrendComparison(highDelta)}
                  <span>{highPrev}</span>
                  <span className="text-gray-400 font-bold">-</span>
                  {renderDeltaBadge(highDelta)}
                </div>
              </div>

              {/* Medium Card */}
              <div className="p-1.5 sm:p-2 md:p-2 xl:p-2.5 px-3 sm:px-3.5 md:px-3.5 xl:px-4 rounded-lg bg-white/60 backdrop-blur-md border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] flex items-center justify-between">
                <div>
                  <span className="inline-block bg-[#5B9BD5] text-white text-[10px] sm:text-xs font-black px-2 sm:px-2.5 py-0.5 rounded shadow-[0_2px_4px_rgba(91,155,213,0.25)] uppercase tracking-wider">
                    Medium
                  </span>
                  <p className="text-lg sm:text-xl xl:text-2xl font-black text-[#5B9BD5] tracking-tight leading-tight mt-0.5">
                    {mediumCount}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base xl:text-lg font-black text-gray-900">
                  {renderTrendComparison(mediumDelta)}
                  <span>{mediumPrev}</span>
                  <span className="text-gray-400 font-bold">-</span>
                  {renderDeltaBadge(mediumDelta)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Risk Score Widget */}
        <div className="md:col-span-1 lg:col-span-3 xl:col-span-3 2xl:col-span-3 h-full">
          <RiskScoreWidget
            score={typeof statsData?.riskScore === 'number' ? statsData.riskScore : (statsData?.riskScore?.score ?? 0)}
            lastMonthScore={statsData?.riskLastMonth ?? 0}
            periodLabel={periodLabel}
          />
        </div>

        {/* 3. Top Incident */}
        <div className="md:col-span-2 lg:col-span-5 xl:col-span-5 2xl:col-span-5 bg-white/80 backdrop-blur-xl rounded-xl border border-white/80 flex flex-col justify-between relative z-20 overflow-hidden h-full shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
          <div className="h-11 sm:h-12 md:h-12 xl:h-13 bg-[#002B9A]/95 backdrop-blur-md text-white font-black px-3.5 sm:px-4 md:px-4.5 xl:px-5 2xl:px-6 flex items-center justify-between flex-shrink-0 border-b border-white/10 rounded-t-xl relative z-30 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <span className="text-xs sm:text-sm md:text-sm xl:text-base">Top Incident</span>
            <div className="relative z-30">
              <button
                ref={severityButtonRef}
                onClick={() => setIsSeverityDropdownOpen(!isSeverityDropdownOpen)}
                className="bg-white/90 backdrop-blur-md text-gray-900 text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 rounded-md flex items-center gap-1 hover:bg-white transition border border-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)] cursor-pointer"
              >
                <span>{severityFilter}</span>
                <HiOutlineChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>

              {isSeverityDropdownOpen && mounted && severityCoords && createPortal(
                <div
                  ref={severityDropdownRef}
                  style={{ position: 'fixed', top: `${severityCoords.top}px`, right: `${severityCoords.right}px` }}
                  className="w-32 2xl:w-36 bg-white/80 backdrop-blur-2xl rounded-md border border-white/80 py-1.5 z-50 text-gray-800 text-xs xl:text-sm 2xl:text-base font-semibold shadow-[0_20px_50px_rgba(0,43,154,0.15),inset_0_1px_1px_rgba(255,255,255,0.95)] space-y-0.5"
                >
                  {['Critical', 'High', 'Medium'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => {
                        setSeverityFilter(sev as 'Critical' | 'High' | 'Medium');
                        setIsSeverityDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                        severityFilter === sev ? 'bg-blue-50/90 text-[#002B9A] font-black' : 'text-gray-700 hover:bg-blue-50/80'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          </div>

          {/* Item Container - Clean natural spacing with justify-start */}
          <div className="divide-y divide-gray-100/80 flex-1 flex flex-col justify-start px-1 overflow-hidden rounded-b-xl relative z-10">
            {isLoading ? (
              <div className="p-4 text-center text-xs sm:text-xs md:text-sm xl:text-sm 2xl:text-base font-bold text-gray-500">Loading top incidents...</div>
            ) : filteredIncidents.length === 0 ? (
              <div className="p-4 text-center text-xs sm:text-xs md:text-sm xl:text-sm 2xl:text-base font-bold text-gray-500">No {severityFilter} incidents found.</div>
            ) : (
              filteredIncidents.slice(0, 5).map((inc) => (
                <div
                  key={inc.id}
                  className="p-2 sm:p-2.5 md:p-2.5 xl:p-3 2xl:p-3.5 px-2.5 sm:px-3 md:px-3.5 xl:px-4 2xl:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-blue-50/50 transition flex-shrink-0"
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="text-xs sm:text-xs md:text-sm xl:text-sm 2xl:text-base font-extrabold text-gray-900 leading-tight truncate">
                        <span
                          className={
                            inc.severity === 'Critical'
                              ? 'text-[#B8251B] font-black'
                              : inc.severity === 'High'
                              ? 'text-[#EA580C] font-black'
                              : 'text-[#5B9BD5] font-black'
                          }
                        >
                          {inc.severity}:
                        </span>{' '}
                        {inc.incidentName}
                      </p>

                      <div className="flex items-center gap-1 text-[10px] sm:text-[11px] md:text-[11px] xl:text-xs 2xl:text-sm text-gray-600 truncate">
                        <span className="font-bold text-gray-500">Agent:</span>
                        {(inc.agentsList || [inc.agent]).slice(0, 3).map((ag: string, idx: number) => (
                          <React.Fragment key={idx}>
                            <button
                              onClick={() => handleAgentClick(ag, inc.incidentName)}
                              className="text-[#0066B1] hover:text-[#002B9A] hover:underline font-extrabold transition"
                            >
                              {ag}
                            </button>
                            {idx < (inc.agentsList?.length || 1) - 1 && <span className="text-gray-400">-</span>}
                          </React.Fragment>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-[9px] sm:text-[10px] md:text-[10px] xl:text-[11px] 2xl:text-xs">
                        <span className="bg-white/75 backdrop-blur-md px-1.5 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-gray-800 font-extrabold border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)]">
                          Count: <span className="font-black text-gray-900">{inc.count || 1} Detected</span>
                        </span>
                        <span className="bg-white/75 backdrop-blur-md px-1.5 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-gray-800 font-extrabold border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)]">
                          Observed: <span className="font-black text-gray-900">{inc.lastObserved || inc.firstObserved || 'Recently'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto flex-shrink-0">
                    <button
                      onClick={() => {
                        setSelectedMoreAgentsIncident(inc);
                        setIsMoreAgentsOpen(true);
                      }}
                      className="bg-black/90 backdrop-blur-sm hover:bg-black text-white font-black text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-1 xl:py-1.5 2xl:py-2 rounded-md transition shadow-[0_2px_6px_rgba(0,0,0,0.15)] cursor-pointer"
                    >
                      Agent
                    </button>
                    <button
                      onClick={() => router.push(`/incidents?search=${encodeURIComponent(inc.incidentName)}`)}
                      className="bg-[#002B9A]/95 backdrop-blur-sm hover:bg-[#002175] text-white font-black text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base px-3 sm:px-3.5 xl:px-4 2xl:px-5 py-1 xl:py-1.5 2xl:py-2 rounded-md transition shadow-[0_2px_6px_rgba(0,43,154,0.25)] cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recommended Action - Latest */}
      <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] overflow-hidden flex-shrink-0">
        <div className="h-11 sm:h-12 md:h-12 xl:h-13 bg-[#002B9A]/95 backdrop-blur-md text-white font-black px-3.5 sm:px-4 md:px-4.5 xl:px-5 2xl:px-6 flex items-center text-xs sm:text-sm md:text-sm xl:text-base border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          Recommended Action - Latest
        </div>

        <div className="divide-y divide-gray-200/50">
          {isLoading ? (
            <div className="p-4 text-center text-xs sm:text-xs md:text-sm xl:text-sm 2xl:text-base font-bold text-gray-500">Loading recommended actions...</div>
          ) : recommendedActionsSource.length === 0 ? (
            <div className="p-4 text-center text-xs sm:text-xs md:text-sm xl:text-sm 2xl:text-base font-bold text-gray-500">No recommended actions found.</div>
          ) : (
            recommendedActionsSource.slice(0, 3).map((act, idx) => (
              <div key={idx} className="p-2 sm:p-2.5 md:p-3 xl:p-3.5 2xl:p-4 px-3 sm:px-4 md:px-4.5 xl:px-5 2xl:px-6 flex items-center justify-between gap-3 sm:gap-4 hover:bg-white/60 transition">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  {renderSeverityBadge(act.severity)}
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-extrabold text-gray-900 truncate">
                      {act.action}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base text-gray-500 font-semibold mt-0.5">
                      <span>{act.date}</span>
                      {act.time && <span>{act.time}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRecommendedActionView(act.id || act.reportId)}
                  className="bg-[#002B9A]/95 backdrop-blur-sm hover:bg-[#002175] text-white font-bold text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 rounded-md transition flex items-center gap-1 sm:gap-1.5 flex-shrink-0 shadow-[0_2px_8px_rgba(0,43,154,0.2)] cursor-pointer"
                >
                  <span>View Report</span>
                  <HiOutlineArrowUpRight className="w-3.5 h-3.5 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* More Agents Modal */}
      <MoreAgentsModal
        isOpen={isMoreAgentsOpen}
        onClose={() => {
          setIsMoreAgentsOpen(false);
          setSelectedMoreAgentsIncident(null);
        }}
        agents={
          selectedMoreAgentsIncident?.agentsList ||
          (selectedMoreAgentsIncident ? [selectedMoreAgentsIncident.agent] : [])
        }
        incidentName={selectedMoreAgentsIncident?.incidentName}
      />
    </div>
  );
}
