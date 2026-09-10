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
  HiOutlineRectangleGroup,
  HiOutlineXMark,
  HiChevronUp,
  HiChevronDown
} from 'react-icons/hi2';
import { Incident } from '@/lib/types';
import { fetchIncidents, FetchIncidentsResponse } from '@/lib/api-client';
import { IncidentDetailDrawer } from '@/components/drawers/IncidentDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { GroupByModal, GroupByMode } from '@/components/modals/GroupByModal';
import { useTimeFilter } from '@/lib/time-filter-context';
import { Pagination } from '@/components/ui/Pagination';
import { formatDateTimeAndAgo, getTimestamp, formatNumber } from '@/lib/date-utils';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/client-cache';

type SortKey = 'incidentName' | 'severity' | 'agent' | 'firstObserved' | 'lastObserved' | 'count';
type SortDirection = 'asc' | 'desc';

function IncidentsContent() {
  const searchParams = useSearchParams();

  const { timeFilter, customRange } = useTimeFilter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statsData, setStatsData] = useState<any>(null);
  const [filterOptions, setFilterOptions] = useState<{
    agents: string[];
    incidentNames: string[];
    severities: string[];
  }>({ agents: [], incidentNames: [], severities: ['Critical', 'High', 'Medium', 'Low'] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [groupByMode, setGroupByMode] = useState<GroupByMode>('alerts');
  const [isGroupByModalOpen, setIsGroupByModalOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state (default: newest first)
  const [sortKey, setSortKey] = useState<SortKey>('firstObserved');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Cycle tracking to discard stale async responses
  const cycleIdRef = React.useRef<number>(0);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sync URL search parameters (e.g. from Dashboard Top Incidents view)
  useEffect(() => {
    const paramIncident = searchParams.get('incidentName') || searchParams.get('incident') || searchParams.get('incidentType');
    const paramAgent = searchParams.get('agent');
    const paramSeverity = searchParams.get('severity');
    const paramSearch = searchParams.get('search');
    const paramGroupBy = searchParams.get('groupBy');

    if (paramGroupBy === 'incidents' || paramGroupBy === 'alerts') {
      setGroupByMode(paramGroupBy as GroupByMode);
    }

    const newFilters: Record<string, string> = {};
    if (paramIncident) newFilters.incidentName = paramIncident;
    if (paramAgent) newFilters.agent = paramAgent;
    if (paramSeverity) newFilters.severity = paramSeverity;

    if (Object.keys(newFilters).length > 0) {
      setActiveFilters(newFilters);
      setCurrentPage(1);
    }
    if (paramSearch && !paramIncident) {
      setSearchTerm(paramSearch);
      setCurrentPage(1);
    }
  }, [searchParams]);

  // Reset to page 1 whenever filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeFilters, timeFilter, customRange, groupByMode]);

  // Fetch server-side paginated & aggregated data with in-memory caching
  const loadData = async (forceRefresh = false) => {
    cycleIdRef.current += 1;
    const currentCycle = cycleIdRef.current;

    const cacheKey = `incidents:${groupByMode}:${timeFilter}:${customRange?.startDate || ''}:${customRange?.endDate || ''}:${currentPage}:${sortKey}:${sortDirection}:${debouncedSearch}:${JSON.stringify(activeFilters)}`;

    if (!forceRefresh) {
      try {
        const cached = await getClientCache<FetchIncidentsResponse>(cacheKey);
        if (cycleIdRef.current !== currentCycle) return;
        if (cached && Array.isArray(cached.data)) {
          setIncidents(cached.data);
          setTotal(cached.total);
          setTotalAlerts(cached.totalAlerts);
          setTotalPages(cached.totalPages);
          if (cached.stats) setStatsData({ incidents: cached.stats });
          if (cached.filterOptions) setFilterOptions(cached.filterOptions);
          setIsLoading(false);
          return;
        }
      } catch (cacheErr) {
        console.warn('[Incidents] Cache read notice:', cacheErr);
      }
    } else {
      await invalidateClientCache(cacheKey);
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchIncidents({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch,
        severity: activeFilters.severity,
        incidentType: activeFilters.incidentName,
        agent: activeFilters.agent,
        sortBy: sortKey,
        sortOrder: sortDirection,
        timeRange: timeFilter,
        startDate: customRange?.startDate,
        endDate: customRange?.endDate,
        groupBy: groupByMode,
      });

      if (cycleIdRef.current !== currentCycle) return;

      setIncidents(res.data || []);
      setTotal(res.total);
      setTotalAlerts(res.totalAlerts);
      setTotalPages(res.totalPages);
      if (res.stats) setStatsData({ incidents: res.stats });
      if (res.filterOptions) setFilterOptions(res.filterOptions);

      setClientCache(cacheKey, res);
    } catch (err: any) {
      if (cycleIdRef.current !== currentCycle) return;
      console.error('Failed to load incidents data:', err);
      setError(err.message || 'Failed to load incidents');
    } finally {
      if (cycleIdRef.current === currentCycle) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [groupByMode, timeFilter, customRange, currentPage, sortKey, sortDirection, debouncedSearch, activeFilters]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      if (key === 'firstObserved' || key === 'lastObserved' || key === 'count') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
    setCurrentPage(1);
  };

  const dynamicFilterSections: FilterSection[] = useMemo(() => {
    return [
      {
        key: 'severity',
        label: 'Severity Level',
        type: 'buttons',
        options: filterOptions.severities.length ? filterOptions.severities : ['Critical', 'High', 'Medium', 'Low'],
      },
      {
        key: 'incidentName',
        label: groupByMode === 'incidents' ? 'Incident Name' : 'Alert Name',
        type: 'select',
        options: filterOptions.incidentNames || [],
      },
      {
        key: 'agent',
        label: 'Agent Affected',
        type: 'select',
        options: filterOptions.agents || [],
      },
    ];
  }, [filterOptions, groupByMode]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedIncidents = incidents;

  const handleApplyFilters = (filters: Record<string, string>) => {
    setActiveFilters(filters);
    setCurrentPage(1);
  };

  const activeCount = Object.keys(activeFilters).filter((k) => activeFilters[k] && activeFilters[k] !== 'All').length;

  const handleToggleDetail = (inc: Incident) => {
    const incId = inc.id || inc._id || `${inc.incidentName}_${inc.firstObserved}`;
    const selectedId = selectedIncident?.id || selectedIncident?._id || (selectedIncident ? `${selectedIncident.incidentName}_${selectedIncident.firstObserved}` : null);
    if (isDrawerOpen && selectedId === incId) {
      setIsDrawerOpen(false);
      setSelectedIncident(null);
    } else {
      setSelectedIncident(inc);
      setIsDrawerOpen(true);
    }
  };

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

  // Severity Stats (Live dynamic calculation)
  const incStats = statsData?.incidents || {};
  const criticalCount = typeof incStats.critical === 'number' ? incStats.critical : 0;
  const highCount = typeof incStats.high === 'number' ? incStats.high : 0;
  const mediumCount = typeof incStats.medium === 'number' ? incStats.medium : 0;

  const criticalPrev = typeof incStats.criticalPrev === 'number' ? incStats.criticalPrev : 0;
  const criticalDelta = typeof incStats.criticalDelta === 'number' ? incStats.criticalDelta : 0;

  const highPrev = typeof incStats.highPrev === 'number' ? incStats.highPrev : 0;
  const highDelta = typeof incStats.highDelta === 'number' ? incStats.highDelta : 0;

  const mediumPrev = typeof incStats.mediumPrev === 'number' ? incStats.mediumPrev : 0;
  const mediumDelta = typeof incStats.mediumDelta === 'number' ? incStats.mediumDelta : 0;

  const renderTrend = (delta: number) => {
    if (delta > 0) return <HiOutlineArrowTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 xl:w-5 xl:h-5 text-red-600 stroke-[3]" />;
    if (delta < 0) return <HiOutlineArrowTrendingDown className="w-4 h-4 sm:w-5 sm:h-5 xl:w-5 xl:h-5 text-emerald-600 stroke-[3]" />;
    return <HiOutlineMinus className="w-4 h-4 sm:w-5 sm:h-5 xl:w-5 xl:h-5 text-gray-400 stroke-[3]" />;
  };

  const renderDeltaBadge = (delta: number) => {
    if (delta > 0) {
      return (
        <span className="bg-red-50/90 text-red-600 border border-red-200 px-2 sm:px-2.5 xl:px-3 py-0.5 sm:py-1 rounded-lg font-black text-xs sm:text-sm xl:text-base flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] whitespace-nowrap">
          <HiOutlineArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> +{formatNumber(delta)}
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span className="bg-emerald-50/90 text-emerald-600 border border-emerald-200 px-2 sm:px-2.5 xl:px-3 py-0.5 sm:py-1 rounded-lg font-black text-xs sm:text-sm xl:text-base flex items-center gap-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] whitespace-nowrap">
          <HiOutlineArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> {formatNumber(delta)}
        </span>
      );
    }
    return (
      <span className="bg-gray-100/90 text-gray-700 border border-gray-200 px-2 sm:px-2.5 xl:px-3 py-0.5 sm:py-1 rounded-lg font-black text-xs sm:text-sm xl:text-base flex items-center gap-1 whitespace-nowrap">
        <HiOutlineMinus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> 0
      </span>
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Top Container: KPI Cards + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[402px] xl:mr-[442px] 2xl:mr-[492px]" : ""}`}>

        {/* Top KPI Cards (3 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Critical Severity Card */}
          <div className="bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between gap-2 min-w-0 overflow-hidden">
            <div className="min-w-0 flex-shrink-0">
              <div className="inline-block bg-[#B8251B] text-white text-xs sm:text-sm font-black px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md shadow-sm mb-1">
                Critical
              </div>
              <p className="text-2xl sm:text-3xl xl:text-3xl font-black text-gray-900 tracking-tight leading-none mt-1">
                {formatNumber(criticalCount)}
              </p>
            </div>
            <div className="flex flex-col items-end justify-center gap-1.5 flex-shrink-0">
              <div
                className="flex items-center gap-1 sm:gap-1.5 text-sm sm:text-base xl:text-lg font-black text-gray-900 leading-none"
                title={`Previous: ${formatNumber(criticalPrev)} (${incStats.periodLabel || 'Previous Period'})`}
              >
                {renderTrend(criticalDelta)}
                <span>{formatNumber(criticalPrev)}</span>
              </div>
              {renderDeltaBadge(criticalDelta)}
            </div>
          </div>

          {/* High Severity Card */}
          <div className="bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between gap-2 min-w-0 overflow-hidden">
            <div className="min-w-0 flex-shrink-0">
              <div className="inline-block bg-[#EA580C] text-white text-xs sm:text-sm font-black px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md shadow-sm mb-1">
                High
              </div>
              <p className="text-2xl sm:text-3xl xl:text-3xl font-black text-gray-900 tracking-tight leading-none mt-1">
                {formatNumber(highCount)}
              </p>
            </div>
            <div className="flex flex-col items-end justify-center gap-1.5 flex-shrink-0">
              <div
                className="flex items-center gap-1 sm:gap-1.5 text-sm sm:text-base xl:text-lg font-black text-gray-900 leading-none"
                title={`Previous: ${formatNumber(highPrev)} (${incStats.periodLabel || 'Previous Period'})`}
              >
                {renderTrend(highDelta)}
                <span>{formatNumber(highPrev)}</span>
              </div>
              {renderDeltaBadge(highDelta)}
            </div>
          </div>

          {/* Medium Severity Card */}
          <div className="bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between gap-2 min-w-0 overflow-hidden">
            <div className="min-w-0 flex-shrink-0">
              <div className="inline-block bg-[#5B9BD5] text-white text-xs sm:text-sm font-black px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-md shadow-sm mb-1">
                Medium
              </div>
              <p className="text-2xl sm:text-3xl xl:text-3xl font-black text-gray-900 tracking-tight leading-none mt-1">
                {formatNumber(mediumCount)}
              </p>
            </div>
            <div className="flex flex-col items-end justify-center gap-1.5 flex-shrink-0">
              <div
                className="flex items-center gap-1 sm:gap-1.5 text-sm sm:text-base xl:text-lg font-black text-gray-900 leading-none"
                title={`Previous: ${formatNumber(mediumPrev)} (${incStats.periodLabel || 'Previous Period'})`}
              >
                {renderTrend(mediumDelta)}
                <span>{formatNumber(mediumPrev)}</span>
              </div>
              {renderDeltaBadge(mediumDelta)}
            </div>
          </div>
        </div>

        {/* Filter Toolbar - Responsive on Mobile & Desktop */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <HiOutlineMagnifyingGlass className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search Incident / Agent / Description"
                className="w-full bg-white/80 backdrop-blur-md text-gray-900 placeholder-gray-400 border border-white/80 rounded-xl pl-9 pr-3 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#002B9A] shadow-sm"
              />
            </div>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="bg-black/90 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-black transition border border-white/20 shadow-sm cursor-pointer whitespace-nowrap min-h-[38px]"
            >
              <HiOutlineAdjustmentsHorizontal className="w-4 h-4 text-blue-300" />
              <span>Filter{activeCount > 0 ? ` (${activeCount})` : ''}</span>
            </button>

            <button
              onClick={() => setIsGroupByModalOpen(true)}
              className="bg-black/90 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-black transition border border-white/20 shadow-sm cursor-pointer whitespace-nowrap min-h-[38px]"
              title="Select Group By Mode"
            >
              <HiOutlineRectangleGroup className="w-4 h-4 text-blue-300" />
              <span>Group by: <strong className="text-blue-300 capitalize">{groupByMode}</strong></span>
            </button>
          </div>

          <button
            onClick={() => loadData(true)}
            className="bg-black/90 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-black transition border border-white/20 shadow-sm cursor-pointer whitespace-nowrap min-h-[38px] sm:w-auto"
          >
            <HiOutlineArrowPath className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Active Filter Badges */}
        {(activeCount > 0 || searchTerm.trim()) && (
          <div className="flex flex-wrap items-center gap-2 px-1 flex-shrink-0">
            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
              Active Filters:
            </span>
            {activeFilters.incidentName && activeFilters.incidentName !== 'All' && (
              <span className="inline-flex items-center gap-1.5 bg-white text-[#002B9A] border-2 border-[#002B9A]/60 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(0,43,154,0.12)]">
                <span>Incident: <strong className="text-[#002B9A] font-black">{activeFilters.incidentName}</strong></span>
                <button
                  onClick={() => {
                    setActiveFilters((prev) => {
                      const next = { ...prev };
                      delete next.incidentName;
                      return next;
                    });
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove incident filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {activeFilters.agent && activeFilters.agent !== 'All' && (
              <span className="inline-flex items-center gap-1.5 bg-white text-[#0066B1] border-2 border-[#0066B1]/60 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(0,102,177,0.12)]">
                <span>Agent: <strong className="text-[#0066B1] font-black">{activeFilters.agent}</strong></span>
                <button
                  onClick={() => {
                    setActiveFilters((prev) => {
                      const next = { ...prev };
                      delete next.agent;
                      return next;
                    });
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove agent filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {activeFilters.severity && activeFilters.severity !== 'All' && (
              <span className="inline-flex items-center gap-1.5 bg-white text-amber-800 border-2 border-amber-500/70 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(217,119,6,0.12)]">
                <span>Severity: <strong className="text-amber-800 font-black">{activeFilters.severity}</strong></span>
                <button
                  onClick={() => {
                    setActiveFilters((prev) => {
                      const next = { ...prev };
                      delete next.severity;
                      return next;
                    });
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove severity filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {searchTerm.trim() && (
              <span className="inline-flex items-center gap-1.5 bg-white text-gray-900 border-2 border-gray-300 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <span>Search: <strong className="text-gray-900 font-black">&quot;{searchTerm}&quot;</strong></span>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Clear search"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setActiveFilters({});
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer shadow-sm ml-1 flex items-center gap-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Data Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-gray-500">
              Loading incidents...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-red-600">
              Error: {error}
            </div>
          ) : paginatedIncidents.length === 0 ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-gray-500">
              No incidents found.
            </div>
          ) : (
            <>
              {/* MOBILE CARD LIST VIEW (Phones: < md) */}
              <div className="block md:hidden divide-y divide-gray-100 p-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                {paginatedIncidents.map((inc) => {
                  const incId = inc.id || inc._id || `${inc.incidentName}_${inc.firstObserved}`;
                  const selectedId = selectedIncident?.id || selectedIncident?._id;
                  const isSelected = Boolean(isDrawerOpen && selectedId && incId && selectedId === incId);
                  const { dateTime, timeAgo } = formatDateTimeAndAgo(inc.firstObserved);

                  return (
                    <div
                      key={inc.id}
                      onClick={() => handleToggleDetail(inc)}
                      className={`p-3 rounded-xl transition cursor-pointer mb-2 border ${
                        isSelected
                          ? 'bg-blue-50/90 border-[#002B9A]/30 shadow-sm'
                          : 'bg-white/80 hover:bg-blue-50/50 border-white/80 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-black ${
                            inc.severity === 'Critical'
                              ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                              : inc.severity === 'High'
                              ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                              : 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {timeAgo || dateTime}
                        </span>
                      </div>

                      <p className="text-sm font-extrabold text-gray-900 leading-snug mb-2 break-words">
                        {inc.incidentName}
                      </p>

                      {groupByMode === 'incidents' && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs mb-2">
                          <span className="bg-blue-50 text-[#002B9A] border border-blue-200/80 px-2 py-0.5 rounded-md font-bold">
                            Count: <strong className="font-black">{inc.count || 1}</strong>
                          </span>
                          {inc.lastObserved && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                              Last: <strong className="font-bold text-gray-900">{inc.lastObserved}</strong>
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1 font-semibold text-gray-600">
                          <span className="text-gray-500 font-bold">Agent:</span>
                          <span className="text-[#0066B1] font-bold">{inc.agent}</span>
                        </div>
                        <span className="text-xs text-[#002B9A] font-extrabold hover:underline">
                          View Details →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP DATA TABLE (md+) */}
              <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="sticky top-0 z-10 bg-[#002B9A] text-white select-none">
                    <tr className="bg-[#002B9A] text-white text-xs xl:text-sm 2xl:text-base font-bold tracking-wider border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                      <th onClick={() => handleSort('incidentName')} className={`bg-[#002B9A] ${groupByMode === 'incidents' ? 'w-[32%]' : 'w-[42%]'} py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition`}>
                        <div className="flex items-center text-white">
                          <span>{groupByMode === 'incidents' ? 'Incident Name' : 'Alert Name'}</span>
                          {renderSortIndicator('incidentName')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('severity')} className={`bg-[#002B9A] ${groupByMode === 'incidents' ? 'w-[12%]' : 'w-[15%]'} py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition`}>
                        <div className="flex items-center text-white">
                          <span>Severity</span>
                          {renderSortIndicator('severity')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('agent')} className={`bg-[#002B9A] ${groupByMode === 'incidents' ? 'w-[16%]' : 'w-[20%]'} py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition`}>
                        <div className="flex items-center text-white">
                          <span>Agent</span>
                          {renderSortIndicator('agent')}
                        </div>
                      </th>
                      {groupByMode === 'incidents' && (
                        <th onClick={() => handleSort('count')} className="bg-[#002B9A] w-[10%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                          <div className="flex items-center text-white">
                            <span>Count</span>
                            {renderSortIndicator('count')}
                          </div>
                        </th>
                      )}
                      <th onClick={() => handleSort('firstObserved')} className={`bg-[#002B9A] ${groupByMode === 'incidents' ? 'w-[15%]' : 'w-[23%]'} py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition`}>
                        <div className="flex items-center text-white">
                          <span>First Observed</span>
                          {renderSortIndicator('firstObserved')}
                        </div>
                      </th>
                      {groupByMode === 'incidents' && (
                        <th onClick={() => handleSort('lastObserved')} className="bg-[#002B9A] w-[15%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                          <div className="flex items-center text-white">
                            <span>Last Observed</span>
                            {renderSortIndicator('lastObserved')}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-xs sm:text-sm font-normal">
                    {paginatedIncidents.map((inc) => {
                      const incId = inc.id || inc._id || `${inc.incidentName}_${inc.firstObserved}`;
                      const selectedId = selectedIncident?.id || selectedIncident?._id;
                      const isSelected = Boolean(isDrawerOpen && selectedId && incId && selectedId === incId);
                      const { dateTime, timeAgo } = formatDateTimeAndAgo(inc.firstObserved);
                      const lastFormatted = inc.lastObserved ? formatDateTimeAndAgo(inc.lastObserved) : null;

                      return (
                        <tr
                          key={inc.id}
                          onClick={() => handleToggleDetail(inc)}
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-blue-100/80' : 'hover:bg-blue-50/40'
                          }`}
                        >
                          <td className="relative py-3 px-3.5 xl:px-4 text-gray-900 font-semibold">
                            {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                            <div className="flex items-center gap-2">
                              <span className="break-words whitespace-normal">{inc.incidentName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 xl:px-4 font-medium">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
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
                          <td className="py-3 px-3.5 xl:px-4 text-[#0066B1] font-semibold">{inc.agent}</td>
                          {groupByMode === 'incidents' && (
                            <td className="py-3 px-3.5 xl:px-4 font-bold text-gray-900">
                              {inc.count || 1}
                            </td>
                          )}
                          <td className="py-3 px-3.5 xl:px-4">
                            <div className="flex flex-col leading-tight">
                              <span className="font-semibold text-gray-900 text-xs sm:text-sm">{dateTime}</span>
                              {timeAgo && <span className="text-xs text-gray-500 font-medium">{timeAgo}</span>}
                            </div>
                          </td>
                          {groupByMode === 'incidents' && (
                            <td className="py-3 px-3.5 xl:px-4">
                              <div className="flex flex-col leading-tight">
                                <span className="font-semibold text-gray-900 text-xs sm:text-sm">{lastFormatted?.dateTime || inc.lastObserved || '-'}</span>
                                {lastFormatted?.timeAgo && <span className="text-xs text-gray-500 font-medium">{lastFormatted.timeAgo}</span>}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Interactive Pagination Controls */}
          <div className="bg-white/80 backdrop-blur-md border-t border-white/60 px-3.5 sm:px-4 py-2.5 sm:py-3 flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-center justify-between text-xs sm:text-sm font-semibold text-gray-800 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
            <div>
              Showing {total === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, total)} of {formatNumber(total)} {groupByMode === 'incidents' ? 'Incidents' : 'Alerts'}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Slide-out Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setSelectedIncident(null); }}
        groupByMode={groupByMode}
      />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={(filters) => { setActiveFilters(filters); setCurrentPage(1); }}
        initialFilters={activeFilters}
        sections={dynamicFilterSections}
        title="Filter Incidents"
      />

      <GroupByModal
        isOpen={isGroupByModalOpen}
        onClose={() => setIsGroupByModalOpen(false)}
        currentMode={groupByMode}
        onSelectMode={(mode) => {
          setGroupByMode(mode);
          setCurrentPage(1);
        }}
      />
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<div className="p-4 font-semibold text-gray-700">Loading Incidents...</div>}>
      <IncidentsContent />
    </Suspense>
  );
}
