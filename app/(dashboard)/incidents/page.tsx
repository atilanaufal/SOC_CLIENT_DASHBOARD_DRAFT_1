'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineMinus,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineAdjustmentsHorizontal,
  HiChevronUp,
  HiChevronDown
} from 'react-icons/hi2';
import { Incident } from '@/lib/types';
import { fetchIncidents, fetchDashboardStats } from '@/lib/api-client';
import { IncidentDetailDrawer } from '@/components/drawers/IncidentDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { useTimeFilter } from '@/lib/time-filter-context';
import { Pagination } from '@/components/ui/Pagination';

type SortKey = 'incidentName' | 'severity' | 'agent' | 'firstObserved';
type SortDirection = 'asc' | 'desc';

function IncidentsContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('agent') || '';

  const { timeFilter, customRange } = useTimeFilter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [statsData, setStatsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('firstObserved');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [data, stats] = await Promise.all([
        fetchIncidents({
          timeRange: timeFilter,
          startDate: customRange?.startDate,
          endDate: customRange?.endDate,
        }),
        fetchDashboardStats(timeFilter, customRange),
      ]);
      setIncidents(data);
      setStatsData(stats);
    } catch (err: any) {
      console.error('Failed to load incidents:', err);
      setError(err.message || 'Failed to load incidents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeFilter, customRange]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      if (key === 'firstObserved') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
  };

  const adaptiveFilterSections: FilterSection[] = useMemo(() => {
    const severities = Array.from(new Set(incidents.map((i) => i.severity))).filter(Boolean);
    const types = Array.from(
      new Set(
        incidents.map((i) => {
          if (typeof i.incident_type === 'string') return i.incident_type;
          if (Array.isArray(i.incident_type) && i.incident_type.length > 0) return i.incident_type[0];
          return i.incidentName;
        })
      )
    ).filter(Boolean) as string[];
    const agents = Array.from(new Set(incidents.map((i) => i.agent))).filter(Boolean);

    return [
      { key: 'severity', label: 'Severity Level', type: 'buttons', options: severities.length ? severities : ['Critical', 'High', 'Medium'] },
      { key: 'type', label: 'Incident Type', type: 'select', options: types },
      { key: 'agent', label: 'Affected Agent', type: 'select', options: agents },
    ];
  }, [incidents]);

  const displayableIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const sev = String(inc.severity || '').toLowerCase();
      return sev !== 'low' && sev !== 'informational' && sev !== 'info';
    });
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    return displayableIncidents.filter((inc) => {
      const matchesSearch =
        inc.incidentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.agent.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((inc as any).ip && (inc as any).ip.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSeverity =
        !activeFilters.severity || activeFilters.severity === 'All'
          ? true
          : String(inc.severity || '').toLowerCase() === activeFilters.severity.toLowerCase();

      const itemType =
        typeof inc.incident_type === 'string'
          ? inc.incident_type
          : Array.isArray(inc.incident_type) && inc.incident_type.length > 0
          ? inc.incident_type[0]
          : inc.incidentName;

      const matchesType =
        !activeFilters.type || activeFilters.type === 'All'
          ? true
          : itemType === activeFilters.type;

      const matchesAgent =
        !activeFilters.agent || activeFilters.agent === 'All'
          ? true
          : inc.agent === activeFilters.agent;

      return matchesSearch && matchesSeverity && matchesType && matchesAgent;
    });
  }, [displayableIncidents, searchTerm, activeFilters]);

  const sortedIncidents = useMemo(() => {
    return [...filteredIncidents].sort((a: any, b: any) => {
      if (sortKey === 'firstObserved') {
        const getTime = (i: any) => {
          const raw = i.last_observed || i.first_observed || i.raw_first_observed || i.firstObserved || i.date;
          if (!raw) return 0;
          const d = new Date(raw);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        const aTime = getTime(a);
        const bTime = getTime(b);
        return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
      }

      let aVal: any = a[sortKey] || '';
      let bVal: any = b[sortKey] || '';

      if (sortKey === 'severity') {
        const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        aVal = order[String(aVal).toLowerCase()] || 0;
        bVal = order[String(bVal).toLowerCase()] || 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredIncidents, sortKey, sortDirection]);

  // Live KPI metrics from statsData (MongoDB calculated)
  const incStats = statsData?.incidents || {};
  const kpiCounts = {
    critical: typeof incStats.critical === 'number' ? incStats.critical : 0,
    criticalPrev: typeof incStats.criticalPrev === 'number' ? incStats.criticalPrev : 0,
    criticalDelta: typeof incStats.criticalDelta === 'number' ? incStats.criticalDelta : 0,

    high: typeof incStats.high === 'number' ? incStats.high : 0,
    highPrev: typeof incStats.highPrev === 'number' ? incStats.highPrev : 0,
    highDelta: typeof incStats.highDelta === 'number' ? incStats.highDelta : 0,

    medium: typeof incStats.medium === 'number' ? incStats.medium : 0,
    mediumPrev: typeof incStats.mediumPrev === 'number' ? incStats.mediumPrev : 0,
    mediumDelta: typeof incStats.mediumDelta === 'number' ? incStats.mediumDelta : 0,
  };

  const totalPages = Math.max(1, Math.ceil(sortedIncidents.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedIncidents = sortedIncidents.slice(startIndex, startIndex + pageSize);

  const handleToggleDetail = (incident: Incident) => {
    if (isDrawerOpen && selectedIncident?.id === incident.id) {
      setIsDrawerOpen(false);
      setSelectedIncident(null);
    } else {
      setSelectedIncident(incident);
      setIsDrawerOpen(true);
    }
  };

  const activeCount = Object.values(activeFilters).filter((v) => v && v !== 'All').length;

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return <span className="opacity-40 ml-1">↕</span>;
    }
    return sortDirection === 'asc' ? (
      <HiChevronUp className="w-4 h-4 inline-block ml-1 text-blue-300" />
    ) : (
      <HiChevronDown className="w-4 h-4 inline-block ml-1 text-blue-300" />
    );
  };

  const renderDeltaBadge = (delta: number) => {
    if (delta > 0) {
      return (
        <span className="bg-red-50/90 text-red-600 border border-red-200 px-2 sm:px-2.5 2xl:px-3 py-0.5 rounded-md font-black text-xs sm:text-sm 2xl:text-base flex items-center gap-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <HiOutlineArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> +{delta}
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span className="bg-emerald-50/90 text-emerald-600 border border-emerald-200 px-2 sm:px-2.5 2xl:px-3 py-0.5 rounded-md font-black text-xs sm:text-sm 2xl:text-base flex items-center gap-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <HiOutlineArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> {delta}
        </span>
      );
    }
    return (
      <span className="bg-gray-100/90 text-gray-700 border border-gray-200 px-2 sm:px-2.5 2xl:px-3 py-0.5 rounded-md font-black text-xs sm:text-sm 2xl:text-base flex items-center gap-0.5">
        <HiOutlineMinus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> 0
      </span>
    );
  };

  const renderTrendComparison = (trend: number) => {
    if (trend > 0) {
      return (
        <div className="flex items-center gap-1 font-black text-red-600">
          <HiOutlineArrowTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6 text-red-600 stroke-[3]" />
        </div>
      );
    }
    if (trend < 0) {
      return (
        <div className="flex items-center gap-1 font-black text-emerald-600">
          <HiOutlineArrowTrendingDown className="w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6 text-emerald-600 stroke-[3]" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 font-black text-gray-400">
        <HiOutlineMinus className="w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6 text-gray-400 stroke-[3]" />
      </div>
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Left Container: KPI Card + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[392px] 2xl:mr-[456px]" : ""}`}>
        {/* Top KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 md:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Critical Card */}
          <div className="p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm md:text-sm xl:text-base font-black text-gray-900 tracking-tight">
                Critical
              </p>
              <p className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-[#B8251B] mt-0.5 sm:mt-1 tracking-tight">
                {kpiCounts.critical}
              </p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 text-sm sm:text-base md:text-base xl:text-lg 2xl:text-xl font-black text-gray-900">
              {renderTrendComparison(kpiCounts.criticalDelta)}
              <span>{kpiCounts.criticalPrev}</span>
              <span className="text-gray-400 font-bold">-</span>
              {renderDeltaBadge(kpiCounts.criticalDelta)}
            </div>
          </div>

          {/* High Card */}
          <div className="p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm md:text-sm xl:text-base font-black text-gray-900 tracking-tight">
                High
              </p>
              <p className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-[#EA580C] mt-0.5 sm:mt-1 tracking-tight">
                {kpiCounts.high}
              </p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 text-sm sm:text-base md:text-base xl:text-lg 2xl:text-xl font-black text-gray-900">
              {renderTrendComparison(kpiCounts.highDelta)}
              <span>{kpiCounts.highPrev}</span>
              <span className="text-gray-400 font-bold">-</span>
              {renderDeltaBadge(kpiCounts.highDelta)}
            </div>
          </div>

          {/* Medium Card */}
          <div className="p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm md:text-sm xl:text-base font-black text-gray-900 tracking-tight">
                Medium
              </p>
              <p className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-[#5B9BD5] mt-0.5 sm:mt-1 tracking-tight">
                {kpiCounts.medium}
              </p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 text-sm sm:text-base md:text-base xl:text-lg 2xl:text-xl font-black text-gray-900">
              {renderTrendComparison(kpiCounts.mediumDelta)}
              <span>{kpiCounts.mediumPrev}</span>
              <span className="text-gray-400 font-bold">-</span>
              {renderDeltaBadge(kpiCounts.mediumDelta)}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm xl:max-w-md 2xl:max-w-lg">
              <HiOutlineMagnifyingGlass className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-5 xl:h-5 2xl:w-6 2xl:h-6 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search Incident / Agent / IP"
                className="w-full bg-white/75 backdrop-blur-md text-gray-900 placeholder-gray-400 border border-white/80 rounded-lg pl-8 sm:pl-8.5 pr-2.5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold focus:outline-none focus:ring-2 focus:ring-[#002B9A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
              />
            </div>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="bg-black/90 backdrop-blur-sm text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold px-2.5 sm:px-3 xl:px-4 2xl:px-5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 rounded-md flex items-center gap-1 sm:gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer"
            >
              <HiOutlineAdjustmentsHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 2xl:w-5 2xl:h-5 text-blue-300" />
              <span>Filter{activeCount > 0 ? ` (${activeCount})` : ''}</span>
            </button>
          </div>

          <button
            onClick={() => loadData()}
            className="bg-black/90 backdrop-blur-sm text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 rounded-md flex items-center gap-1 sm:gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer"
          >
            <HiOutlineArrowPath className={`w-3 h-3 sm:w-3.5 sm:h-3.5 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Data Table Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-[#002B9A] text-white select-none">
                <tr className="bg-[#002B9A] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black tracking-wider border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <th onClick={() => handleSort('incidentName')} className="bg-[#002B9A] w-[45%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Incident</span>
                      {renderSortIndicator('incidentName')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="bg-[#002B9A] w-[15%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('agent')} className="bg-[#002B9A] w-[20%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Agent</span>
                      {renderSortIndicator('agent')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('firstObserved')} className="bg-[#002B9A] w-[20%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>First Observed</span>
                      {renderSortIndicator('firstObserved')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center font-bold text-gray-500">
                      Loading incidents...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center font-bold text-red-600">
                      Error: {error}
                    </td>
                  </tr>
                ) : paginatedIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center font-bold text-gray-500">
                      No incidents found.
                    </td>
                  </tr>
                ) : (
                  paginatedIncidents.map((inc) => {
                    const incId = inc.id || inc._id || `${inc.incidentName}_${inc.firstObserved}`;
                    const selectedId = selectedIncident?.id || selectedIncident?._id;
                    const isSelected = Boolean(isDrawerOpen && selectedId && incId && selectedId === incId);
                    const parts = (inc.firstObserved || '').split(' ');
                    const datePart = parts.slice(0, 3).join(' ');
                    const timePart = parts.slice(3).join(' ');

                    return (
                      <tr
                        key={inc.id}
                        onClick={() => handleToggleDetail(inc)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-100/80'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="relative py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-gray-900 font-extrabold">
                          {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                          <div className="flex items-center gap-2">
                            <span className="break-words whitespace-normal">{inc.incidentName}</span>
                          </div>
                        </td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-bold">
                          <span
                            className={`inline-block px-2 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm font-extrabold ${
                              inc.severity === 'Critical'
                                ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                                : inc.severity === 'High'
                                ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                                : 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                            }`}
                          >
                            {inc.severity}
                          </span>
                        </td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-[#0066B1] font-extrabold">{inc.agent}</td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5">
                          <div className="flex flex-col leading-tight">
                            <span className="font-extrabold text-gray-900 text-xs sm:text-xs xl:text-sm 2xl:text-base">{datePart}</span>
                            <span className="text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm text-gray-500 font-semibold">{timePart}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Interactive Pagination Controls */}
          <div className="bg-white/60 backdrop-blur-md border-t border-white/60 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 py-2 xl:py-2.5 2xl:py-3 flex items-center justify-between text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold text-gray-800 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
            <div>
              Showing {filteredIncidents.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredIncidents.length)} of {filteredIncidents.length} Incidents
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Right Container: Detail Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setSelectedIncident(null); }}
      />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={(filters) => { setActiveFilters(filters); setCurrentPage(1); }}
        initialFilters={activeFilters}
        sections={adaptiveFilterSections}
        title="Filter Incidents"
      />
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<div className="p-4 font-bold text-gray-700">Loading Incidents...</div>}>
      <IncidentsContent />
    </Suspense>
  );
}
