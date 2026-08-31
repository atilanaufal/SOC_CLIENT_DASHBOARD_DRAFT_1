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
  HiOutlineShieldExclamation,
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

function isWithinTimeFilter(
  dateStr: string,
  filter: string,
  customRange?: { startDate: string; endDate: string } | null
): boolean {
  if (!dateStr || dateStr === 'N/A') return true;
  try {
    const itemDate = new Date(dateStr);
    if (isNaN(itemDate.getTime())) return true;

    if (filter === 'Custom' || filter.toLowerCase().startsWith('custom')) {
      if (customRange?.startDate && customRange?.endDate) {
        const start = new Date(`${customRange.startDate}T00:00:00.000`);
        const end = new Date(`${customRange.endDate}T23:59:59.999`);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return itemDate >= start && itemDate <= end;
        }
      }
    }

    const now = Date.now();
    const diffMs = now - itemDate.getTime();

    if (filter === 'Today') {
      return diffMs <= 24 * 60 * 60 * 1000 || itemDate.toDateString() === new Date().toDateString();
    } else if (filter === 'This Week') {
      return diffMs <= 7 * 24 * 60 * 60 * 1000;
    } else if (filter === 'This Month') {
      return diffMs <= 30 * 24 * 60 * 60 * 1000;
    }
  } catch {
    return true;
  }
  return true;
}

function IncidentsContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('agent') || '';

  const { timeFilter, customRange, metrics } = useTimeFilter();
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
      setError(err.message || 'Failed to load incidents from server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeFilter, customRange]);

  useEffect(() => {
    if (initialSearch && incidents.length > 0) {
      setSearchTerm(initialSearch);
      const matched = incidents.find(
        (i) =>
          i.incidentName.toLowerCase().includes(initialSearch.toLowerCase()) ||
          i.agent.toLowerCase().includes(initialSearch.toLowerCase())
      );
      if (matched) {
        setSelectedIncident(matched);
        setIsDrawerOpen(true);
      }
    }
  }, [initialSearch, incidents]);

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

  const displayableIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const agentStr = String(inc.agent || inc.host || '').toLowerCase();
      return agentStr !== '000' && agentStr !== 'health-checker' && !agentStr.includes('000');
    });
  }, [incidents]);

  const adaptiveFilterSections: FilterSection[] = useMemo(() => {
    const severities = Array.from(new Set(displayableIncidents.map((i) => i.severity))).filter(Boolean);
    const types = Array.from(new Set(displayableIncidents.map((i) => i.incidentName))).filter(Boolean);
    const agents = Array.from(new Set(displayableIncidents.map((i) => i.agent))).filter(Boolean);

    return [
      { key: 'severity', label: 'Severity Level', type: 'buttons', options: severities.length ? severities : ['Critical', 'High', 'Medium'] },
      { key: 'incidentType', label: 'Incident Type', type: 'select', options: types },
      { key: 'agent', label: 'Agent', type: 'select', options: agents },
    ];
  }, [displayableIncidents]);

  const filteredIncidents = useMemo(() => {
    return displayableIncidents.filter((inc) => {
      const matchesSearch =
        inc.incidentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.agent.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.agentsList?.some((ag) => ag.toLowerCase().includes(searchTerm.toLowerCase())) ||
        inc.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.sourceIp && inc.sourceIp.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSeverity =
        !activeFilters.severity || activeFilters.severity === 'All'
          ? true
          : String(inc.severity || '').toLowerCase() === activeFilters.severity.toLowerCase();

      const matchesType =
        !activeFilters.incidentType || activeFilters.incidentType === 'All'
          ? true
          : inc.incidentName === activeFilters.incidentType;

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

  // Compute real counts & deltas for KPI directly synced with Dashboard server metrics
  const kpiCounts = useMemo(() => {
    if (statsData?.incidents) {
      const inc = statsData.incidents;
      return {
        critical: typeof inc.critical === 'number' ? inc.critical : 0,
        criticalPrev: typeof inc.criticalPrev === 'number' ? inc.criticalPrev : 0,
        criticalDelta: typeof inc.criticalDelta === 'number' ? inc.criticalDelta : 0,
        high: typeof inc.high === 'number' ? inc.high : 0,
        highPrev: typeof inc.highPrev === 'number' ? inc.highPrev : 0,
        highDelta: typeof inc.highDelta === 'number' ? inc.highDelta : 0,
        medium: typeof inc.medium === 'number' ? inc.medium : 0,
        mediumPrev: typeof inc.mediumPrev === 'number' ? inc.mediumPrev : 0,
        mediumDelta: typeof inc.mediumDelta === 'number' ? inc.mediumDelta : 0,
      };
    }

    let c = 0, h = 0, m = 0;
    displayableIncidents.forEach((i: any) => {
      const sev = String(i.severity || '').toLowerCase();
      if (sev === 'critical') c++;
      else if (sev === 'high') h++;
      else if (sev === 'medium') m++;
    });

    return {
      critical: c,
      criticalPrev: 0,
      criticalDelta: 0,
      high: h,
      highPrev: 0,
      highDelta: 0,
      medium: m,
      mediumPrev: 0,
      mediumDelta: 0,
    };
  }, [statsData, displayableIncidents]);

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
  };  const renderDeltaBadge = (delta: number) => {
    if (delta > 0) {
      return (
        <span className="bg-red-50/90 text-red-600 border border-red-200 px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 rounded-md font-black text-xs sm:text-sm xl:text-sm 2xl:text-base flex items-center gap-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <HiOutlineArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> +{delta}
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span className="bg-emerald-50/90 text-emerald-600 border border-emerald-200 px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 rounded-md font-black text-xs sm:text-sm xl:text-sm 2xl:text-base flex items-center gap-0.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
          <HiOutlineArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> {delta}
        </span>
      );
    }
    return (
      <span className="bg-gray-100/90 text-gray-700 border border-gray-200 px-2.5 sm:px-3 xl:px-3.5 2xl:px-4 py-0.5 sm:py-1 rounded-md font-black text-xs sm:text-sm xl:text-sm 2xl:text-base flex items-center gap-0.5">
        <HiOutlineMinus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> 0
      </span>
    );
  };

  const renderTrendComparison = (trend: number) => {
    if (trend > 0) {
      return (
        <div className="flex items-center gap-1 font-black text-red-600">
          <HiOutlineArrowTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 xl:w-5.5 xl:h-5.5 2xl:w-6 2xl:h-6 text-red-600 stroke-[3]" />
        </div>
      );
    }
    if (trend < 0) {
      return (
        <div className="flex items-center gap-1 font-black text-emerald-600">
          <HiOutlineArrowTrendingDown className="w-4 h-4 sm:w-5 sm:h-5 xl:w-5.5 xl:h-5.5 2xl:w-6 2xl:h-6 text-emerald-600 stroke-[3]" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 font-black text-gray-400">
        <HiOutlineMinus className="w-4 h-4 sm:w-5 sm:h-5 xl:w-5.5 xl:h-5.5 2xl:w-6 2xl:h-6 text-gray-400 stroke-[3]" />
      </div>
    );
  };

  return (
<<<<<<< Updated upstream
    <div className="w-full flex flex-col lg:flex-row gap-3 min-w-0">
      {/* Left Container: KPI Card + Search Bar + Table */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 w-full">
        {/* Top Clean KPI Summary Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 p-3 sm:p-4 md:p-4.5 xl:p-5 2xl:p-6 flex-shrink-0 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)]">
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 xl:gap-8 2xl:gap-10 divide-y sm:divide-y-0 sm:divide-x divide-gray-200/60">
            {/* Critical Column */}
            <div className="sm:pr-3 md:pr-4 xl:pr-6 2xl:pr-8">
              <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="bg-[#FF1E1E] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2 sm:px-2.5 xl:px-3 2xl:px-3.5 py-0.5 xl:py-1 2xl:py-1.5 rounded-md shadow-[0_2px_6px_rgba(255,30,30,0.3)]">
                    Critical
                  </span>
                  {renderDeltaBadge(kpiCounts.criticalDelta)}
                </div>
                {renderTrendComparison(kpiCounts.critical, kpiCounts.criticalPrev)}
              </div>
              <p className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-gray-900 tracking-tight">{kpiCounts.critical}</p>
=======
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Left Container: KPI Card + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[392px] 2xl:mr-[456px]" : ""}`}>
        {/* Top KPI Summary Cards (Identical to Dashboard layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 md:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Critical Card */}
          <div className="p-2 sm:p-2.5 md:p-2.5 xl:p-3 2xl:p-3.5 px-3.5 sm:px-4 md:px-4 xl:px-5 2xl:px-6 rounded-xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <span className="bg-[#FF1E1E] text-white text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-black py-1.5 sm:py-2 xl:py-2.5 2xl:py-3 px-3.5 sm:px-4 xl:px-5 2xl:px-6 rounded-md shadow-[0_2px_8px_rgba(255,30,30,0.3)]">
              Critical: {kpiCounts.critical}
            </span>
            <div className="flex items-center gap-2 sm:gap-2.5 text-base sm:text-lg md:text-lg xl:text-xl 2xl:text-2xl font-black text-gray-900">
              {renderTrendComparison(kpiCounts.criticalDelta)}
              <span>{kpiCounts.criticalPrev}</span>
              <span className="text-gray-400 font-bold">-</span>
              {renderDeltaBadge(kpiCounts.criticalDelta)}
>>>>>>> Stashed changes
            </div>
          </div>

<<<<<<< Updated upstream
            {/* High Column */}
            <div className="sm:px-3 md:px-4 xl:px-6 2xl:px-8 pt-2 sm:pt-0">
              <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="bg-[#FF6B00] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2 sm:px-2.5 xl:px-3 2xl:px-3.5 py-0.5 xl:py-1 2xl:py-1.5 rounded-md shadow-[0_2px_6px_rgba(255,107,0,0.3)]">
                    High
                  </span>
                  {renderDeltaBadge(kpiCounts.highDelta)}
                </div>
                {renderTrendComparison(kpiCounts.high, kpiCounts.highPrev)}
              </div>
              <p className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-gray-900 tracking-tight">{kpiCounts.high}</p>
=======
          {/* High Card */}
          <div className="p-2 sm:p-2.5 md:p-2.5 xl:p-3 2xl:p-3.5 px-3.5 sm:px-4 md:px-4 xl:px-5 2xl:px-6 rounded-xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <span className="bg-[#FF6B00] text-white text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-black py-1.5 sm:py-2 xl:py-2.5 2xl:py-3 px-3.5 sm:px-4 xl:px-5 2xl:px-6 rounded-md shadow-[0_2px_8px_rgba(255,107,0,0.3)]">
              High: {kpiCounts.high}
            </span>
            <div className="flex items-center gap-2 sm:gap-2.5 text-base sm:text-lg md:text-lg xl:text-xl 2xl:text-2xl font-black text-gray-900">
              {renderTrendComparison(kpiCounts.highDelta)}
              <span>{kpiCounts.highPrev}</span>
              <span className="text-gray-400 font-bold">-</span>
              {renderDeltaBadge(kpiCounts.highDelta)}
>>>>>>> Stashed changes
            </div>
          </div>

<<<<<<< Updated upstream
            {/* Medium Column */}
            <div className="sm:pl-3 md:pl-4 xl:pl-6 2xl:pl-8 pt-2 sm:pt-0">
              <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="bg-[#D97706] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black px-2 sm:px-2.5 xl:px-3 2xl:px-3.5 py-0.5 xl:py-1 2xl:py-1.5 rounded-md shadow-[0_2px_6px_rgba(217,119,6,0.3)]">
                    Medium
                  </span>
                  {renderDeltaBadge(kpiCounts.mediumDelta)}
                </div>
                {renderTrendComparison(kpiCounts.medium, kpiCounts.mediumPrev)}
              </div>
              <p className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-gray-900 tracking-tight">{kpiCounts.medium}</p>
=======
          {/* Medium Card */}
          <div className="p-2 sm:p-2.5 md:p-2.5 xl:p-3 2xl:p-3.5 px-3.5 sm:px-4 md:px-4 xl:px-5 2xl:px-6 rounded-xl bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <span className="bg-[#D97706] text-white text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-black py-1.5 sm:py-2 xl:py-2.5 2xl:py-3 px-3.5 sm:px-4 xl:px-5 2xl:px-6 rounded-md shadow-[0_2px_8px_rgba(217,119,6,0.3)]">
              Medium: {kpiCounts.medium}
            </span>
            <div className="flex items-center gap-2 sm:gap-2.5 text-base sm:text-lg md:text-lg xl:text-xl 2xl:text-2xl font-black text-gray-900">
              {renderTrendComparison(kpiCounts.mediumDelta)}
              <span>{kpiCounts.mediumPrev}</span>
              <span className="text-gray-400 font-bold">-</span>
              {renderDeltaBadge(kpiCounts.mediumDelta)}
>>>>>>> Stashed changes
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
              <thead>
                <tr className="bg-[#002B9A]/95 backdrop-blur-md text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black tracking-wider sticky top-0 z-10 select-none border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
<<<<<<< Updated upstream
                  <th onClick={() => handleSort('incidentName')} className="w-[45%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
=======
                  <th onClick={() => handleSort('incidentName')} className="w-[45%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition ">
>>>>>>> Stashed changes
                    <div className="flex items-center">
                      <span>Incident</span>
                      {renderSortIndicator('incidentName')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="w-[15%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('agent')} className="w-[20%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center">
                      <span>Agent</span>
                      {renderSortIndicator('agent')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('firstObserved')} className="w-[20%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center">
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
<<<<<<< Updated upstream
                            ? 'bg-blue-100/70 border-l-4 border-l-[#002B9A]'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-gray-900 font-extrabold">
                          <div className="flex items-center gap-2">
                            <HiOutlineShieldExclamation className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-5 xl:h-5 2xl:w-6 2xl:h-6 text-[#002B9A] flex-shrink-0" />
                            <span className="truncate">{inc.incidentName}</span>
=======
                            ? 'bg-blue-100/80'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="relative py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-gray-900 font-extrabold">
                          {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                          <div className="flex items-center gap-2">
                            
                            <span className="break-words whitespace-normal">{inc.incidentName}</span>
>>>>>>> Stashed changes
                          </div>
                        </td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-bold">
                          <span
                            className={`inline-block px-2 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm font-extrabold ${
                              inc.severity === 'Critical'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : inc.severity === 'High'
                                ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
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
