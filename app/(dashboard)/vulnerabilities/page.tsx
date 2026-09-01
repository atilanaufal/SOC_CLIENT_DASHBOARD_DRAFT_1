'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
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
import { formatDateTimeAndAgo, getTimestamp } from '@/lib/date-utils';

type SortKey = 'name' | 'severity' | 'status' | 'agent' | 'cveId' | 'detectionDate';
type SortDirection = 'asc' | 'desc';

function VulnerabilitiesContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('agent') || '';

  const { timeFilter, customRange } = useTimeFilter();
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state (default: newest first)
  const [sortKey, setSortKey] = useState<SortKey>('detectionDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Interactive Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Real-time Database fetch
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchVulnerabilities({
        timeRange: timeFilter,
        startDate: customRange?.startDate,
        endDate: customRange?.endDate,
      });
      setVulnerabilities(res || []);
    } catch (err: any) {
      console.error('Error fetching live vulnerabilities:', err);
      setError(err.message || 'Gagal memuat data kerentanan dari database.');
    } finally {
      setLoading(false);
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
    setCurrentPage(1);
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

      return matchesSearch && matchesSeverity && matchesStatus && matchesVuln && matchesAgent;
    });
  }, [vulnerabilities, searchTerm, activeFilters]);

  const sortedVulns = useMemo(() => {
    return [...filteredVulns].sort((a, b) => {
      let aVal = a[sortKey] || '';
      let bVal = b[sortKey] || '';

      if (sortKey === 'severity') {
        const severityWeight: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
          informational: 0,
        };
        const aWeight = severityWeight[String(aVal).toLowerCase()] || 0;
        const bWeight = severityWeight[String(bVal).toLowerCase()] || 0;
        return sortDirection === 'asc' ? aWeight - bWeight : bWeight - aWeight;
      }

      if (sortKey === 'detectionDate') {
        const timeA = getTimestamp(aVal);
        const timeB = getTimestamp(bVal);
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredVulns, sortKey, sortDirection]);

  // Dynamic Metrics Calculation
  const stats = useMemo(() => {
    return {
      critical: filteredVulns.filter((v) => String(v.severity).toLowerCase() === 'critical').length,
      high: filteredVulns.filter((v) => String(v.severity).toLowerCase() === 'high').length,
      medium: filteredVulns.filter((v) => String(v.severity).toLowerCase() === 'medium').length,
      solved: filteredVulns.filter((v) => String(v.status).toLowerCase() === 'solved' || String(v.status).toLowerCase() === 'patched').length,
    };
  }, [filteredVulns]);

  // Aggregate Vulnerability Distribution by Name/Package
  const vulnDistSegments = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredVulns.forEach((v) => {
      const rawName = (v.vulnerability || v.name || v.package || 'Unknown').trim();
      const cleanName = rawName.split(' ')[0].replace(/[^a-zA-Z0-9_-]/g, '');
      const label = cleanName.length > 12 ? cleanName.substring(0, 11) + '…' : cleanName || 'Other';
      counts[label] = (counts[label] || 0) + 1;
    });

    const sortedLabels = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top4 = sortedLabels.slice(0, 4);
    const otherCount = sortedLabels.slice(4).reduce((sum, [, count]) => sum + count, 0);

    const colors = ['#B8251B', '#EA580C', '#5B9BD5', '#8B5CF6', '#9CA3AF'];
    const segments = top4.map(([label, value], i) => ({
      label,
      value,
      color: colors[i % colors.length],
      fullLabel: label,
    }));

    if (otherCount > 0) {
      segments.push({
        label: 'Other',
        value: otherCount,
        color: colors[4],
        fullLabel: 'Other Vulnerabilities',
      });
    }

    return segments;
  }, [filteredVulns]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(sortedVulns.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedVulns = sortedVulns.slice(startIndex, startIndex + pageSize);

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
  const totalVulnsCount = stats.critical + stats.high + stats.medium;

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Container: KPI Cards + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[402px] xl:mr-[442px] 2xl:mr-[492px]" : ""}`}>

        {/* Top KPI Cards (3 columns: 5, 4, 3 span) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 md:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Total Vulnerability */}
          <div className="md:col-span-5 bg-white/70 backdrop-blur-xl p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-around gap-2.5 sm:gap-3">
            <BestDonutChart
              segments={totalVulnSegments}
              centerLabel={totalVulnsCount.toString()}
              size={100}
              strokeWidth={12}
            />
            <div className="space-y-1 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold">
              <h4 className="text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold uppercase text-gray-500 tracking-wider border-b border-gray-200/50 pb-0.5">
                Total Vulnerability
              </h4>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-red-700 font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#B8251B]"></span>Critical</span>
                <span className="text-gray-900 text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-bold">{stats.critical}</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-orange-600 font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#EA580C]"></span>High</span>
                <span className="text-gray-900 text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-bold">{stats.high}</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:gap-4 text-[#0066B1] font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#5B9BD5]"></span>Medium</span>
                <span className="text-gray-900 text-xs sm:text-sm md:text-sm xl:text-base 2xl:text-lg font-bold">{stats.medium}</span>
              </div>
            </div>
          </div>

          {/* Vuln Distribution Widget */}
          <div className="md:col-span-4 bg-white/70 backdrop-blur-xl p-3 sm:p-3.5 md:p-3.5 xl:p-4 2xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-2.5 sm:gap-3">
            <BestDonutChart
              segments={vulnDistSegments}
              centerLabel=""
              size={100}
              strokeWidth={12}
            />
            <div className="flex-1 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base min-w-0">
              <h4 className="font-bold text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base uppercase tracking-wider text-gray-500 mb-1 sm:mb-1.5 border-b border-gray-200/50 pb-0.5">
                Vuln Distribution
              </h4>
              {vulnDistSegments.length === 0 ? (
                <div className="text-[11px] sm:text-xs text-gray-400 font-semibold italic py-2">
                  No vulnerabilities detected
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-0.5 sm:gap-y-1 font-bold text-gray-700 text-[10px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base max-h-16 sm:max-h-18 xl:max-h-20 2xl:max-h-24 overflow-y-auto pr-1">
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
              <h4 className="font-bold text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base uppercase tracking-wider text-gray-500">Solved Vuln</h4>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl md:text-3xl xl:text-4xl 2xl:text-5xl font-bold text-emerald-700">{stats.solved}</span>
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
                className="w-full bg-white/75 backdrop-blur-md text-gray-900 placeholder-gray-400 border border-white/80 rounded-lg pl-8 sm:pl-8.5 pr-2.5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#002B9A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
              />
            </div>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="bg-black/90 backdrop-blur-sm text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold px-2.5 sm:px-3 xl:px-4 2xl:px-5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 rounded-md flex items-center gap-1 sm:gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer"
            >
              <HiOutlineAdjustmentsHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 2xl:w-5 2xl:h-5 text-blue-300" />
              <span>Filter{activeCount > 0 ? ` (${activeCount})` : ''}</span>
            </button>
          </div>

          <button
            onClick={() => loadData()}
            className="bg-black/90 backdrop-blur-sm text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 py-1 sm:py-1.5 xl:py-2 2xl:py-2.5 rounded-md flex items-center gap-1 sm:gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer"
          >
            <HiOutlineArrowPath className="w-3 h-3 sm:w-3.5 sm:h-3.5 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5" />
            <span className="font-semibold">Refresh</span>
          </button>
        </div>

        {/* Data Table Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead className="sticky top-0 z-10 bg-[#002B9A] text-white select-none">
                <tr className="bg-[#002B9A] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-bold tracking-wider border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
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
              <tbody className="divide-y divide-gray-200 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-normal">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-semibold text-gray-500">
                      Loading vulnerabilities...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-semibold text-red-600">
                      Error: {error}
                    </td>
                  </tr>
                ) : paginatedVulns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-semibold text-gray-500">
                      No vulnerabilities found.
                    </td>
                  </tr>
                ) : (
                  paginatedVulns.map((vuln) => {
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
                        <td className="relative py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-gray-900 font-semibold">
                          {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                          <div className="flex items-center gap-2">
                            <span className="break-words whitespace-normal">{vuln.name}</span>
                          </div>
                        </td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-medium">
                          <span className={`inline-block px-2 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-xs sm:text-xs xl:text-sm 2xl:text-base font-bold ${
                            vuln.severity === 'Critical'
                              ? 'bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]'
                              : vuln.severity === 'High'
                              ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]'
                              : 'bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]'
                          }`}>
                            {vuln.severity}
                          </span>
                        </td>

                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-medium">
                          <span className={`inline-block px-2 sm:px-2 xl:px-2.5 2xl:px-3 py-0.5 xl:py-1 rounded-md text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm font-bold ${
                            vuln.status === 'Solved' || vuln.status === 'Patched'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-red-100 text-red-800 border border-red-300'
                          }`}>
                            {vuln.status}
                          </span>
                        </td>

                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-[#0066B1] font-semibold">{vuln.agent}</td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-[#002B9A] font-semibold">{vuln.cveId}</td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5">
                          <div className="flex flex-col leading-tight">
                            <span className="font-semibold text-gray-900 text-xs sm:text-xs xl:text-sm 2xl:text-base">{dateTime}</span>
                            {timeAgo && <span className="text-[10px] sm:text-[11px] xl:text-xs 2xl:text-sm text-gray-500 font-medium">{timeAgo}</span>}
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
          <div className="bg-white/60 backdrop-blur-md border-t border-white/60 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 py-2 xl:py-2.5 2xl:py-3 flex items-center justify-between text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold text-gray-800 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
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
