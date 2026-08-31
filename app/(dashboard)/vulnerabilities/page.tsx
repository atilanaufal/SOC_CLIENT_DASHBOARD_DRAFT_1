'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineAdjustmentsHorizontal,
  HiChevronUp,
  HiChevronDown,
} from 'react-icons/hi2';
import { Vulnerability } from '@/lib/types';
import { fetchVulnerabilities } from '@/lib/api-client';
import { VulnerabilityDetailDrawer } from '@/components/drawers/VulnerabilityDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { BestDonutChart } from '@/components/charts/BestDonutChart';
import { useTimeFilter } from '@/lib/time-filter-context';
import { Pagination } from '@/components/ui/Pagination';

type SortKey = 'name' | 'severity' | 'status' | 'agent' | 'cveId' | 'detectionDate';
type SortDirection = 'asc' | 'desc';

// Helper for dynamic Time Filter on date strings
function isWithinTimeFilter(dateStr?: string, timeFilter?: string, customRange?: { startDate?: string; endDate?: string } | null) {
  if (!dateStr || !timeFilter) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  if (timeFilter === 'Today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d >= start;
  } else if (timeFilter === 'This Week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return d >= start;
  } else if (timeFilter === 'This Month') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return d >= start;
  } else if (timeFilter === 'Custom' && customRange?.startDate && customRange?.endDate) {
    const start = new Date(customRange.startDate);
    const end = new Date(customRange.endDate);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return true;
}

function VulnerabilitiesContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const { timeFilter, customRange } = useTimeFilter();
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('detectionDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchVulnerabilities({
        timeRange: timeFilter,
        startDate: customRange?.startDate,
        endDate: customRange?.endDate,
      });
      setVulnerabilities(data);
    } catch (err: any) {
      console.error('Failed to load vulnerabilities:', err);
      setError(err.message || 'Failed to load vulnerabilities');
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
      if (key === 'detectionDate') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
  };

  const adaptiveFilterSections: FilterSection[] = useMemo(() => {
    const severities = Array.from(new Set(vulnerabilities.map((v) => v.severity))).filter(Boolean) as string[];
    const statuses = Array.from(new Set(vulnerabilities.map((v) => v.status))).filter(Boolean) as string[];
    const names = Array.from(new Set(vulnerabilities.map((v) => v.vulnerability || v.name || v.package))).filter(Boolean) as string[];
    const agents = Array.from(new Set(vulnerabilities.map((v) => v.agent))).filter(Boolean) as string[];

    return [
      { key: 'severity', label: 'Severity Level', type: 'buttons', options: severities.length ? severities : ['Critical', 'High', 'Medium'] },
      { key: 'status', label: 'Status', type: 'buttons', options: statuses.length ? statuses : ['Unsolved', 'Solved', 'Patched'] },
      { key: 'vulnerability', label: 'Vulnerability Name', type: 'select', options: names },
      { key: 'agent', label: 'Agent', type: 'select', options: agents },
    ];
  }, [vulnerabilities]);

  const filteredVulns = useMemo(() => {
    return vulnerabilities.filter((vuln) => {
      const matchesSearch =
        vuln.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vuln.agent.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vuln.cveId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (vuln.ip && vuln.ip.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSeverity =
        !activeFilters.severity || activeFilters.severity === 'All'
          ? true
          : String(vuln.severity || '').toLowerCase() === activeFilters.severity.toLowerCase();

      const matchesStatus =
        !activeFilters.status || activeFilters.status === 'All'
          ? true
          : String(vuln.status || '').toLowerCase() === activeFilters.status.toLowerCase();

      const matchesVuln =
        !activeFilters.vulnerability || activeFilters.vulnerability === 'All'
          ? true
          : (vuln.vulnerability || vuln.name || vuln.package || '').trim().toLowerCase() === activeFilters.vulnerability.trim().toLowerCase();

      const matchesAgent =
        !activeFilters.agent || activeFilters.agent === 'All'
          ? true
          : vuln.agent === activeFilters.agent;

      const matchesTime = isWithinTimeFilter(vuln.detected_at || vuln.detectionDate, timeFilter, customRange);

      return matchesSearch && matchesSeverity && matchesStatus && matchesVuln && matchesAgent && matchesTime;
    });
  }, [vulnerabilities, searchTerm, activeFilters, timeFilter, customRange]);

  const sortedVulns = useMemo(() => {
    return [...filteredVulns].sort((a: any, b: any) => {
      if (sortKey === 'detectionDate') {
        const aDate = new Date(a.detectionDate || a.detected_at || 0).getTime() || 0;
        const bDate = new Date(b.detectionDate || b.detected_at || 0).getTime() || 0;
        return sortDirection === 'desc' ? bDate - aDate : aDate - bDate;
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
  }, [filteredVulns, sortKey, sortDirection]);

  // Compute live stats & distribution segments from filtered data
  const { stats, vulnDistSegments } = useMemo(() => {
    let c = 0, h = 0, m = 0, solved = 0;
    const vulnCounts: Record<string, number> = {};

    filteredVulns.forEach((v) => {
      const sev = String(v.severity || '').toLowerCase();
      if (sev === 'critical') c++;
      else if (sev === 'high') h++;
      else if (sev === 'medium') m++;

      const st = String(v.status || '').toLowerCase();
      if (st === 'solved' || st === 'patched') solved++;

      const vName = (v.vulnerability || v.name || v.package || 'Other').trim();
      vulnCounts[vName] = (vulnCounts[vName] || 0) + 1;
    });

    const topVulns = Object.entries(vulnCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const colors = ['#002B9A', '#0066B1', '#3B82F6', '#60A5FA', '#93C5FD', '#A855F7'];
    let idx = 0;
    const segments = topVulns.map(([rawLabel, value]) => {
      const displayLabel = rawLabel.length > 18 ? rawLabel.substring(0, 16) + '...' : rawLabel;
      return {
        label: displayLabel,
        fullLabel: rawLabel,
        value,
        color: colors[idx++ % colors.length]
      };
    });

    return {
      stats: {
        total: filteredVulns.length,
        critical: c,
        high: h,
        medium: m,
        solved,
        patched: solved,
      },
      vulnDistSegments: segments
    };
  }, [filteredVulns]);

  const totalPages = Math.max(1, Math.ceil(sortedVulns.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedVulns = sortedVulns.slice(startIndex, startIndex + pageSize);

  const handleToggleDetail = (vuln: Vulnerability) => {
    if (isDrawerOpen && selectedVuln?.id === vuln.id) {
      setIsDrawerOpen(false);
      setSelectedVuln(null);
    } else {
      setSelectedVuln(vuln);
      setIsDrawerOpen(true);
    }
  };

  const totalVulnSegments = [
    { label: 'Medium', value: stats.medium, color: '#5B9BD5' },
    { label: 'High', value: stats.high, color: '#EA580C' },
    { label: 'Critical', value: stats.critical, color: '#B8251B' },
  ];

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

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Left Container: KPI Cards + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[392px] 2xl:mr-[456px]" : ""}`}>
        {/* Top KPI Cards (3 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 md:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Total Vulnerability */}
          <div className="md:col-span-5 bg-white/70 backdrop-blur-xl p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-around gap-2.5 sm:gap-3">
            <BestDonutChart
              segments={totalVulnSegments}
              centerLabel={stats.total.toString()}
              size={100}
              strokeWidth={12}
            />
            <div className="space-y-1 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold">
              <h4 className="text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black uppercase text-gray-500 tracking-wider border-b border-gray-200/50 pb-0.5">
                Total Vulnerability
              </h4>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-[#B8251B] font-extrabold">
                <span className="flex items-center gap-1.5"><span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#B8251B]"></span>Critical</span>
                <span className="text-gray-900 text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-black">{stats.critical}</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-[#EA580C] font-extrabold">
                <span className="flex items-center gap-1.5"><span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#EA580C]"></span>High</span>
                <span className="text-gray-900 text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-black">{stats.high}</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-[#5B9BD5] font-extrabold">
                <span className="flex items-center gap-1.5"><span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#5B9BD5]"></span>Medium</span>
                <span className="text-gray-900 text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-black">{stats.medium}</span>
              </div>
            </div>
          </div>

          {/* Vuln Distribution Widget (Functional by Vulnerability Name) */}
          <div className="md:col-span-4 bg-white/70 backdrop-blur-xl p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-2.5 sm:gap-3">
            <BestDonutChart
              segments={vulnDistSegments}
              centerLabel=""
              size={100}
              strokeWidth={12}
            />
            <div className="flex-1 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base min-w-0">
              <h4 className="font-black text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base uppercase tracking-wider text-gray-500 mb-1 sm:mb-1.5 border-b border-gray-200/50 pb-0.5">
                Vuln Distribution
              </h4>
              {vulnDistSegments.length === 0 ? (
                <div className="text-[11px] sm:text-xs text-gray-400 font-semibold italic py-2">
                  No vulnerabilities detected
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 sm:gap-y-1 font-bold text-gray-700 text-[10px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base max-h-16 sm:max-h-18 xl:max-h-20 2xl:max-h-24 overflow-y-auto pr-1">
                  {vulnDistSegments.map((seg, idx) => (
                    <span key={idx} className="flex items-center gap-1 truncate" title={`${(seg as any).fullLabel || seg.label}: ${seg.value} issues`}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                      <span className="truncate">{seg.label} ({seg.value})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Solved Vuln */}
          <div className="md:col-span-3 bg-white/70 backdrop-blur-xl p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 xl:w-14 xl:h-14 2xl:w-16 2xl:h-16 rounded-xl bg-emerald-50/90 backdrop-blur-sm border border-emerald-300 flex-shrink-0 flex items-center justify-center text-emerald-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)]">
              <HiOutlineCheckCircle className="w-6 h-6 sm:w-7 sm:h-7 xl:w-8 xl:h-8 2xl:w-9 2xl:h-9" />
            </div>
            <div>
              <h4 className="font-extrabold text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base uppercase tracking-wider text-gray-500">Solved Vuln</h4>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-black text-emerald-700">{stats.solved}</span>
              </div>
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
                placeholder="Search CVE / Agent / Package"
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
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead className="sticky top-0 z-10 bg-[#002B9A] text-white select-none">
                <tr className="bg-[#002B9A] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black tracking-wider border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <th onClick={() => handleSort('name')} className="bg-[#002B9A] w-[30%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Vulnerability</span>
                      {renderSortIndicator('name')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="bg-[#002B9A] w-[12%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('status')} className="bg-[#002B9A] w-[12%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Status</span>
                      {renderSortIndicator('status')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('agent')} className="bg-[#002B9A] w-[15%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Agent</span>
                      {renderSortIndicator('agent')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('cveId')} className="bg-[#002B9A] w-[15%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>CVE ID</span>
                      {renderSortIndicator('cveId')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('detectionDate')} className="bg-[#002B9A] w-[16%] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Detection Date</span>
                      {renderSortIndicator('detectionDate')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-bold text-gray-500">
                      Loading vulnerabilities...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-bold text-red-600">
                      Error: {error}
                    </td>
                  </tr>
                ) : paginatedVulns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-bold text-gray-500">
                      No vulnerabilities found.
                    </td>
                  </tr>
                ) : (
                  paginatedVulns.map((vuln) => {
                    const vulnId = vuln.id || vuln.cveId || vuln.name;
                    const selectedId = selectedVuln?.id || selectedVuln?.cveId || selectedVuln?.name;
                    const isSelected = Boolean(isDrawerOpen && selectedId && vulnId && selectedId === vulnId);
                    const parts = (vuln.detectionDate || '').split(' ');
                    const datePart = parts.slice(0, 3).join(' ');
                    const timePart = parts.slice(3).join(' ');

                    return (
                      <tr
                        key={vuln.id}
                        onClick={() => handleToggleDetail(vuln)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-100/80' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="relative py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-gray-900 font-extrabold">
                          {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                          <div className="flex items-center gap-2">
                            <span className="break-words whitespace-normal">{vuln.name}</span>
                          </div>
                        </td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-bold">
                          <span className={`inline-block px-2 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm font-extrabold ${
                            vuln.severity === 'Critical'
                              ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                              : vuln.severity === 'High'
                              ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                              : 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                          }`}>
                            {vuln.severity}
                          </span>
                        </td>

                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-bold">
                          <span className={`inline-block px-2 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm font-extrabold ${
                            vuln.status === 'Solved' || vuln.status === 'Patched'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-red-100 text-red-800 border border-red-300'
                          }`}>
                            {vuln.status}
                          </span>
                        </td>

                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-[#0066B1] font-bold">{vuln.agent}</td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-[#002B9A] font-extrabold">{vuln.cveId}</td>
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
              Showing {filteredVulns.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredVulns.length)} of {filteredVulns.length} Vulnerabilities
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
      <VulnerabilityDetailDrawer
        vulnerability={selectedVuln}
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setSelectedVuln(null); }}
      />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={(filters) => { setActiveFilters(filters); setCurrentPage(1); }}
        initialFilters={activeFilters}
        sections={adaptiveFilterSections}
        title="Filter Vulnerabilities"
      />
    </div>
  );
}

export default function VulnerabilitiesPage() {
  return (
    <Suspense fallback={<div className="p-4 font-bold text-gray-700">Loading Vulnerabilities...</div>}>
      <VulnerabilitiesContent />
    </Suspense>
  );
}
