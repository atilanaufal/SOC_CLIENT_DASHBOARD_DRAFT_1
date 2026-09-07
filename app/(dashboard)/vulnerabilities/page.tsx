'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineXMark,
  HiChevronUp,
  HiChevronDown,
} from 'react-icons/hi2';
import { Vulnerability } from '@/lib/types';
import { fetchVulnerabilities, FetchVulnerabilitiesResponse } from '@/lib/api-client';
import { VulnerabilityDetailDrawer } from '@/components/drawers/VulnerabilityDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { BestDonutChart } from '@/components/charts/BestDonutChart';
import { useTimeFilter } from '@/lib/time-filter-context';
import { Pagination } from '@/components/ui/Pagination';
import { formatDateTimeAndAgo, formatNumber } from '@/lib/date-utils';
import { getClientCache, setClientCache, invalidateClientCache } from '@/lib/client-cache';

type SortKey = 'name' | 'severity' | 'status' | 'agent' | 'cveId' | 'detectionDate';
type SortDirection = 'asc' | 'desc';

function VulnerabilitiesContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('agent') || '';

  const { timeFilter, customRange } = useTimeFilter();
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [filteredTotal, setFilteredTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stats for Donut Chart & Cards
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    solved: 0,
  });

  // Top Vulnerability Distribution for Donut Widget
  const [vulnDistSegments, setVulnDistSegments] = useState<Array<{
    label: string;
    value: number;
    color: string;
    fullLabel: string;
  }>>([]);

  // Filter options from database
  const [filterOptions, setFilterOptions] = useState<{
    agents: string[];
    categories: string[];
    vulnerabilities: string[];
  }>({
    agents: [],
    categories: [],
    vulnerabilities: [],
  });

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state (default: newest first)
  const [sortKey, setSortKey] = useState<SortKey>('detectionDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Server Pagination state (10 items per page)
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

  // Reset to page 1 whenever filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeFilters, timeFilter, customRange]);

  // Fetch server-side paginated & aggregated data with in-memory caching
  const loadData = async (forceRefresh = false) => {
    cycleIdRef.current += 1;
    const currentCycle = cycleIdRef.current;

    const cacheKey = `vulnerabilities:${timeFilter}:${customRange?.startDate || ''}:${customRange?.endDate || ''}:${currentPage}:${sortKey}:${sortDirection}:${debouncedSearch}:${JSON.stringify(activeFilters)}`;

    // Read from in-memory cache if navigating between pages in same session
    if (!forceRefresh) {
      try {
        const cached = await getClientCache<FetchVulnerabilitiesResponse>(cacheKey);
        if (cycleIdRef.current !== currentCycle) return;

        if (cached && Array.isArray(cached.data)) {
          setVulnerabilities(cached.data);
          setFilteredTotal(cached.filteredTotal);
          setTotalPages(cached.totalPages);
          if (cached.stats) setStats(cached.stats);
          if (cached.distribution) setVulnDistSegments(cached.distribution);
          if (cached.filterOptions) setFilterOptions(cached.filterOptions);
          setLoading(false);
          return;
        }
      } catch (cacheErr) {
        console.warn('[Vulnerabilities] Cache read notice:', cacheErr);
      }
    } else {
      await invalidateClientCache(cacheKey);
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetchVulnerabilities({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch,
        severity: activeFilters.severity,
        status: activeFilters.status,
        category: activeFilters.category,
        vulnerability: activeFilters.vulnerability,
        agent: activeFilters.agent,
        sortBy: sortKey,
        sortOrder: sortDirection,
        timeRange: timeFilter,
        startDate: customRange?.startDate,
        endDate: customRange?.endDate,
      });

      if (cycleIdRef.current !== currentCycle) return;

      setVulnerabilities(res.data);
      setFilteredTotal(res.filteredTotal);
      setTotalPages(res.totalPages);
      setStats(res.stats);
      setVulnDistSegments(res.distribution);
      setFilterOptions(res.filterOptions);
      setLoading(false);

      // Save to in-memory session cache
      setClientCache(cacheKey, res);
    } catch (err: any) {
      if (cycleIdRef.current === currentCycle) {
        console.error('Error fetching server-side vulnerabilities:', err);
        setError(err.message || 'Failed to load vulnerability data from database.');
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      cycleIdRef.current += 1;
    };
  }, [currentPage, sortKey, sortDirection, debouncedSearch, activeFilters, timeFilter, customRange]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection(key === 'detectionDate' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  // Adaptive Filter Sections dynamically populated from MongoDB facet options
  const adaptiveFilterSections: FilterSection[] = useMemo(() => {
    const severities = ['Critical', 'High', 'Medium', 'Low'];
    const statuses = ['Active', 'Solved'];
    const agents = filterOptions.agents || [];
    const names = filterOptions.vulnerabilities || [];

    return [
      { key: 'severity', label: 'Severity Level', type: 'buttons', options: severities },
      { key: 'status', label: 'Status', type: 'buttons', options: statuses },
      { key: 'agent', label: 'Agent', type: 'select', options: agents },
      { key: 'vulnerability', label: 'Vulnerability Name', type: 'select', options: names },
    ];
  }, [filterOptions]);

  const handleApplyFilters = (filters: Record<string, string>) => {
    setActiveFilters(filters);
    setCurrentPage(1);
  };

  const activeCount = Object.keys(activeFilters).filter((k) => activeFilters[k] && activeFilters[k] !== 'All').length;

  const handleToggleDetail = (vuln: Vulnerability) => {
    const vulnId = vuln.id || vuln.cveId || vuln.name;
    const selectedId = selectedVuln?.id || selectedVuln?.cveId || selectedVuln?.name;
    if (isDrawerOpen && selectedId === vulnId) {
      setIsDrawerOpen(false);
      setSelectedVuln(null);
    } else {
      setSelectedVuln(vuln);
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

  const totalVulnSegments = useMemo(() => [
    { label: 'Medium', value: stats.medium, color: '#5B9BD5' },
    { label: 'High', value: stats.high, color: '#EA580C' },
    { label: 'Critical', value: stats.critical, color: '#B8251B' },
  ], [stats]);

  const totalVulnsCount = stats.total || (stats.critical + stats.high + stats.medium);
  const startIndex = (currentPage - 1) * pageSize;

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Container: KPI Cards + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[402px] xl:mr-[442px] 2xl:mr-[492px]" : ""}`}>

        {/* Top KPI Cards (3 columns: 5, 4, 3 span) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Total Vulnerability */}
          <div className="md:col-span-5 bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-around gap-3">
            <BestDonutChart
              segments={totalVulnSegments}
              centerLabel={formatNumber(totalVulnsCount)}
              size={95}
              strokeWidth={11}
            />
            <div className="space-y-1 text-xs sm:text-xs xl:text-sm font-bold">
              <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider border-b border-gray-200/50 pb-0.5">
                Total Vulnerability
              </h4>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-red-700 font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#B8251B]"></span>Critical</span>
                <span className="text-gray-900 text-sm sm:text-base font-black">{formatNumber(stats.critical)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-orange-600 font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]"></span>High</span>
                <span className="text-gray-900 text-sm sm:text-base font-black">{formatNumber(stats.high)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-[#0066B1] font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#5B9BD5]"></span>Medium</span>
                <span className="text-gray-900 text-sm sm:text-base font-black">{formatNumber(stats.medium)}</span>
              </div>
            </div>
          </div>

          {/* Vuln Distribution Widget */}
          <div className="md:col-span-4 bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-3">
            <BestDonutChart
              segments={vulnDistSegments}
              centerLabel=""
              size={90}
              strokeWidth={11}
            />
            <div className="flex-1 text-xs sm:text-xs xl:text-sm min-w-0">
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-1 border-b border-gray-200/50 pb-0.5">
                Vuln Distribution
              </h4>
              {vulnDistSegments.length === 0 ? (
                <div className="text-xs text-gray-400 font-semibold italic py-2">
                  No vulnerabilities detected
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 font-bold text-gray-700 text-xs max-h-20 overflow-y-auto pr-1">
                  {vulnDistSegments.map((seg, idx) => (
                    <span key={idx} className="flex items-center gap-1 truncate" title={`${seg.fullLabel || seg.label}: ${formatNumber(seg.value)} issues`}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                      <span className="truncate">{seg.label} ({formatNumber(seg.value)})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Solved Vuln */}
          <div className="md:col-span-3 bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-3">
            <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-xl bg-emerald-50/90 backdrop-blur-sm border border-emerald-300 flex-shrink-0 flex items-center justify-center text-emerald-600 shadow-sm">
              <HiOutlineCheckCircle className="w-7 h-7 xl:w-8 xl:h-8" />
            </div>
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500">Solved Vuln</h4>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl sm:text-3xl xl:text-4xl font-black text-emerald-700">{formatNumber(stats.solved)}</span>
              </div>
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
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search CVE / Agent / Package"
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
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              className="bg-black/90 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-black transition border border-white/20 shadow-sm cursor-pointer whitespace-nowrap min-h-[38px] sm:w-auto"
            >
              <HiOutlineArrowPath className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Active Filter Badges */}
        {(activeCount > 0 || searchTerm.trim()) && (
          <div className="flex flex-wrap items-center gap-2 px-1 flex-shrink-0">
            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
              Active Filters:
            </span>
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
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove severity filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {activeFilters.status && activeFilters.status !== 'All' && (
              <span className="inline-flex items-center gap-1.5 bg-white text-[#002B9A] border-2 border-[#002B9A]/60 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(0,43,154,0.12)]">
                <span>Status: <strong className="text-[#002B9A] font-black">{activeFilters.status}</strong></span>
                <button
                  onClick={() => {
                    setActiveFilters((prev) => {
                      const next = { ...prev };
                      delete next.status;
                      return next;
                    });
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove status filter"
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
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove agent filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {activeFilters.vulnerability && activeFilters.vulnerability !== 'All' && (
              <span className="inline-flex items-center gap-1.5 bg-white text-indigo-800 border-2 border-indigo-500/60 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(99,102,241,0.12)]">
                <span>Name: <strong className="text-indigo-800 font-black">{activeFilters.vulnerability}</strong></span>
                <button
                  onClick={() => {
                    setActiveFilters((prev) => {
                      const next = { ...prev };
                      delete next.vulnerability;
                      return next;
                    });
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove vulnerability filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {searchTerm.trim() && (
              <span className="inline-flex items-center gap-1.5 bg-white text-gray-900 border-2 border-gray-300 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <span>Search: <strong className="text-gray-900 font-black">&quot;{searchTerm}&quot;</strong></span>
                <button
                  onClick={() => setSearchTerm('')}
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
              }}
              className="bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer shadow-sm ml-1 flex items-center gap-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Data Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-gray-500">
              Loading vulnerabilities...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-red-600">
              Error: {error}
            </div>
          ) : vulnerabilities.length === 0 ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-gray-500">
              No vulnerabilities found.
            </div>
          ) : (
            <>
              {/* MOBILE CARD LIST VIEW (Phones: < md) */}
              <div className="block md:hidden divide-y divide-gray-100 p-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                {vulnerabilities.map((vuln) => {
                  const vulnId = vuln.id || vuln.cveId || vuln.name;
                  const selectedId = selectedVuln?.id || selectedVuln?.cveId || selectedVuln?.name;
                  const isSelected = Boolean(isDrawerOpen && selectedId && vulnId && selectedId === vulnId);
                  const { dateTime, timeAgo } = formatDateTimeAndAgo(vuln.detectionDate || vuln.detected_at);

                  return (
                    <div
                      key={vuln.id}
                      onClick={() => handleToggleDetail(vuln)}
                      className={`p-3 rounded-xl transition cursor-pointer mb-2 border ${
                        isSelected
                          ? 'bg-blue-50/90 border-[#002B9A]/30 shadow-sm'
                          : 'bg-white/80 hover:bg-blue-50/50 border-white/80 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-black ${
                              vuln.severity === 'Critical'
                                ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                                : vuln.severity === 'High'
                                ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                                : 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                            }`}
                          >
                            {vuln.severity}
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              vuln.status === 'Solved' || vuln.status === 'Patched'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {vuln.status}
                          </span>
                        </div>
                        <span className="text-xs text-[#002B9A] font-bold font-mono">
                          {vuln.cveId}
                        </span>
                      </div>

                      <p className="text-sm font-extrabold text-gray-900 leading-snug mb-2 break-words">
                        {vuln.name}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1 font-semibold text-gray-600">
                          <span className="text-gray-500 font-bold">Agent:</span>
                          <span className="text-[#0066B1] font-bold">{vuln.agent}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {timeAgo || dateTime}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP DATA TABLE (md+) */}
              <div className="hidden md:block overflow-x-auto overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[750px]">
                  <thead className="sticky top-0 z-10 bg-[#002B9A] text-white select-none">
                    <tr className="bg-[#002B9A] text-white text-xs xl:text-sm 2xl:text-base font-bold tracking-wider border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                      <th onClick={() => handleSort('name')} className="bg-[#002B9A] w-[30%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Vulnerability</span>
                          {renderSortIndicator('name')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('severity')} className="bg-[#002B9A] w-[12%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Severity</span>
                          {renderSortIndicator('severity')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('status')} className="bg-[#002B9A] w-[12%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Status</span>
                          {renderSortIndicator('status')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('agent')} className="bg-[#002B9A] w-[15%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Agent</span>
                          {renderSortIndicator('agent')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('cveId')} className="bg-[#002B9A] w-[15%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>CVE ID</span>
                          {renderSortIndicator('cveId')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('detectionDate')} className="bg-[#002B9A] w-[16%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Detection Date</span>
                          {renderSortIndicator('detectionDate')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-xs sm:text-sm font-normal">
                    {vulnerabilities.map((vuln) => {
                      const vulnId = vuln.id || vuln.cveId || vuln.name;
                      const selectedId = selectedVuln?.id || selectedVuln?.cveId || selectedVuln?.name;
                      const isSelected = Boolean(isDrawerOpen && selectedId && vulnId && selectedId === vulnId);
                      const { dateTime, timeAgo } = formatDateTimeAndAgo(vuln.detectionDate || vuln.detected_at);

                      return (
                        <tr
                          key={vuln.id}
                          onClick={() => handleToggleDetail(vuln)}
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-blue-100/80' : 'hover:bg-blue-50/40'
                          }`}
                        >
                          <td className="relative py-3 px-3.5 xl:px-4 text-gray-900 font-semibold">
                            {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                            <div className="flex items-center gap-2">
                              <span className="break-words whitespace-normal">{vuln.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 xl:px-4 font-medium">
                            <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                              vuln.severity === 'Critical'
                                ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                                : vuln.severity === 'High'
                                ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                                : 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                            }`}>
                              {vuln.severity}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 xl:px-4 font-medium">
                            <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                              vuln.status === 'Solved' || vuln.status === 'Patched'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}>
                              {vuln.status}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 xl:px-4 text-[#0066B1] font-semibold">{vuln.agent}</td>
                          <td className="py-3 px-3.5 xl:px-4 text-[#002B9A] font-semibold">{vuln.cveId}</td>
                          <td className="py-3 px-3.5 xl:px-4">
                            <div className="flex flex-col leading-tight">
                              <span className="font-semibold text-gray-900 text-xs sm:text-sm">{dateTime}</span>
                              {timeAgo && <span className="text-xs text-gray-500 font-medium">{timeAgo}</span>}
                            </div>
                          </td>
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
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Showing {filteredTotal === 0 ? 0 : formatNumber(startIndex + 1)}-{formatNumber(Math.min(startIndex + pageSize, filteredTotal))} of {formatNumber(filteredTotal)} Vulnerabilities
              </span>
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
      <VulnerabilityDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedVuln(null);
        }}
        vulnerability={selectedVuln}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filter Vulnerabilities"
        sections={adaptiveFilterSections}
        initialFilters={activeFilters}
        onApply={handleApplyFilters}
      />
    </div>
  );
}

export default function VulnerabilitiesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm font-semibold text-gray-500">Loading vulnerabilities...</div>}>
      <VulnerabilitiesContent />
    </Suspense>
  );
}
