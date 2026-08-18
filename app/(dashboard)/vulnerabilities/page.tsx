'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineShieldExclamation,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineXCircle,
  HiChevronUp,
  HiChevronDown
} from 'react-icons/hi2';
import { Vulnerability } from '@/lib/mock-data';
import { fetchVulnerabilities } from '@/lib/api-client';
import { VulnerabilityDetailDrawer } from '@/components/drawers/VulnerabilityDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { BestDonutChart } from '@/components/charts/BestDonutChart';
import { useTimeFilter } from '@/lib/time-filter-context';

type SortKey = 'name' | 'severity' | 'status' | 'agent' | 'cveId' | 'detectionDate';
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
      return true;
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

export default function VulnerabilitiesPage() {
  const { timeFilter, customRange } = useTimeFilter();
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
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
    const severities = Array.from(new Set(vulnerabilities.map((v) => v.severity))).filter(Boolean);
    const statuses = Array.from(new Set(vulnerabilities.map((v) => v.status))).filter(Boolean);
    const classifications = Array.from(new Set(vulnerabilities.map((v) => v.classification || v.category).filter(Boolean))) as string[];
    const agents = Array.from(new Set(vulnerabilities.map((v) => v.agent))).filter(Boolean);

    return [
      { key: 'severity', label: 'Severity Level', type: 'buttons', options: severities.length ? severities : ['Critical', 'High', 'Medium'] },
      { key: 'status', label: 'Patch Status', type: 'buttons', options: statuses.length ? statuses : ['Patched', 'Not Patched'] },
      { key: 'classification', label: 'Category', type: 'buttons', options: classifications },
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
          : vuln.status === activeFilters.status;

      const matchesClass =
        !activeFilters.classification || activeFilters.classification === 'All'
          ? true
          : (vuln.classification || vuln.category) === activeFilters.classification;

      const matchesAgent =
        !activeFilters.agent || activeFilters.agent === 'All'
          ? true
          : vuln.agent === activeFilters.agent;

      const matchesTime = isWithinTimeFilter(vuln.detectionDate, timeFilter, customRange);

      return matchesSearch && matchesSeverity && matchesStatus && matchesClass && matchesAgent && matchesTime;
    });
  }, [vulnerabilities, searchTerm, activeFilters, timeFilter, customRange]);

  const sortedVulns = useMemo(() => {
    return [...filteredVulns].sort((a: any, b: any) => {
      if (sortKey === 'detectionDate') {
        const getTime = (v: any) => {
          const raw = v.detected_at || v.last_seen || v.first_seen || v.detectionDate || v.date;
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
  }, [filteredVulns, sortKey, sortDirection]);

  // Compute real metrics & dynamic Vuln Distribution by category
  const { stats, vulnDistSegments } = useMemo(() => {
    let c = 0, h = 0, m = 0, patched = 0;
    const catMap = new Map<string, number>();

    filteredVulns.forEach((v) => {
      const sev = String(v.severity || '').toLowerCase();
      if (sev === 'critical') c++;
      else if (sev === 'high') h++;
      else if (sev === 'medium') m++;

      if (v.status === 'Patched') patched++;

      const cat = v.category || v.classification || 'Packages';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });

    const colors = ['#3B82F6', '#A855F7', '#F97316', '#10B981', '#F59E0B', '#6366F1'];
    let idx = 0;
    const segments = Array.from(catMap.entries()).map(([label, value]) => ({
      label,
      value,
      color: colors[idx++ % colors.length]
    }));

    return {
      stats: {
        total: filteredVulns.length,
        critical: c,
        high: h,
        medium: m,
        patched,
      },
      vulnDistSegments: segments.length ? segments : [{ label: 'Software', value: 1, color: '#3B82F6' }]
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
    { label: 'Medium', value: stats.medium, color: '#FFC700' },
    { label: 'High', value: stats.high, color: '#FF6B00' },
    { label: 'Critical', value: stats.critical, color: '#FF1E1E' },
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
    <div className="h-full flex flex-row gap-3 w-full overflow-hidden">
      {/* Left Container: KPI Cards + Search Bar + Table */}
      <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0 h-full overflow-hidden">
        {/* Top KPI Cards (3 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 flex-shrink-0">
          {/* Total Vulnerability */}
          <div className="md:col-span-5 bg-white p-3.5 rounded-md border border-gray-200 flex items-center justify-around gap-3">
            <BestDonutChart
              segments={totalVulnSegments}
              centerLabel={stats.total.toString()}
              size={90}
              strokeWidth={12}
            />
            <div className="space-y-1 text-xs font-bold">
              <h4 className="text-xs font-black uppercase text-gray-500 tracking-wider border-b border-gray-100 pb-0.5">
                Total Vulnerability
              </h4>
              <div className="flex items-center justify-between gap-4 text-red-700 font-extrabold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#FF1E1E]"></span>Critical</span>
                <span className="text-gray-900 text-sm font-black">{stats.critical}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-orange-600 font-extrabold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#FF6B00]"></span>High</span>
                <span className="text-gray-900 text-sm font-black">{stats.high}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-amber-600 font-extrabold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#FFC700]"></span>Medium</span>
                <span className="text-gray-900 text-sm font-black">{stats.medium}</span>
              </div>
            </div>
          </div>

          {/* Vuln Distribution Widget (Functional by Category) */}
          <div className="md:col-span-4 bg-white p-3.5 rounded-md border border-gray-200 flex items-center gap-3">
            <BestDonutChart
              segments={vulnDistSegments}
              centerLabel=""
              size={90}
              strokeWidth={12}
            />
            <div className="flex-1 text-xs">
              <h4 className="font-black text-xs uppercase tracking-wider text-gray-500 mb-1.5 border-b border-gray-100 pb-0.5">
                Vuln Distribution
              </h4>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-bold text-gray-700 text-xs max-h-16 overflow-y-auto">
                {vulnDistSegments.map((seg, idx) => (
                  <span key={idx} className="flex items-center gap-1 truncate" title={`${seg.label}: ${seg.value}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                    <span className="truncate">{seg.label} ({seg.value})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Patched Vuln */}
          <div className="md:col-span-3 bg-white p-3.5 rounded-md border border-gray-200 flex items-center gap-3">
            <div className="w-12 h-12 rounded-md bg-emerald-50 border border-emerald-300 flex-shrink-0 flex items-center justify-center text-emerald-600">
              <HiOutlineCheckCircle className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-gray-500">Patched Vuln</h4>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-black text-emerald-700">{stats.patched}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <HiOutlineMagnifyingGlass className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search CVE / Agent / Package"
                className="w-full bg-white text-gray-900 placeholder-gray-400 border border-gray-300 rounded-md pl-8 pr-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-navy-800"
              />
            </div>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-black transition shadow-xs"
            >
              <HiOutlineAdjustmentsHorizontal className="w-4 h-4 text-blue-300" />
              <span>Filter{activeCount > 0 ? ` (${activeCount})` : ''}</span>
            </button>
          </div>

          <button
            onClick={() => loadData()}
            className="bg-gray-900 text-white text-xs font-bold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-black transition shadow-xs"
          >
            <HiOutlineArrowPath className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Data Table Container */}
        <div className="bg-white rounded-md border border-gray-200 flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-navy-800 text-white text-xs font-black tracking-wider sticky top-0 z-10 select-none">
                  <th onClick={() => handleSort('name')} className="w-[30%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Vulnerability</span>
                      {renderSortIndicator('name')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="w-[12%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('status')} className="w-[12%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Status</span>
                      {renderSortIndicator('status')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('agent')} className="w-[15%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Agent</span>
                      {renderSortIndicator('agent')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('cveId')} className="w-[15%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>CVE ID</span>
                      {renderSortIndicator('cveId')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('detectionDate')} className="w-[16%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Detection Date</span>
                      {renderSortIndicator('detectionDate')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs font-semibold">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center font-bold text-gray-500">
                      Loading vulnerabilities from database...
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
                      No vulnerabilities found for the selected filter ({timeFilter}).
                    </td>
                  </tr>
                ) : (
                  paginatedVulns.map((vuln) => {
                    const isSelected = isDrawerOpen && selectedVuln?.id === vuln.id;
                    const parts = (vuln.detectionDate || '').split(' ');
                    const datePart = parts.slice(0, 3).join(' ');
                    const timePart = parts.slice(3).join(' ');

                    return (
                      <tr
                        key={vuln.id}
                        onClick={() => handleToggleDetail(vuln)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-100/80 border-l-4 border-l-navy-800' : 'hover:bg-blue-50/50'
                        }`}
                      >
                        <td className="py-2 px-3.5 text-gray-900 font-extrabold">
                          <div className="flex items-center gap-2">
                            <HiOutlineShieldExclamation className="w-4 h-4 text-navy-800 flex-shrink-0" />
                            <span className="truncate">{vuln.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3.5 font-bold">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                            vuln.severity === 'Critical'
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : vuln.severity === 'High'
                              ? 'bg-orange-100 text-orange-800 border border-orange-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {vuln.severity}
                          </span>
                        </td>

                        <td className="py-2 px-3.5 font-bold">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                            vuln.status === 'Patched'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-red-100 text-red-800 border border-red-300'
                          }`}>
                            {vuln.status === 'Patched' ? <HiOutlineCheckCircle className="w-3.5 h-3.5" /> : <HiOutlineXCircle className="w-3.5 h-3.5" />}
                            {vuln.status}
                          </span>
                        </td>

                        <td className="py-2 px-3.5 text-gray-900 font-bold">{vuln.agent}</td>
                        <td className="py-2 px-3.5 text-navy-800 font-extrabold">{vuln.cveId}</td>
                        <td className="py-2 px-3.5">
                          <div className="flex flex-col leading-tight">
                            <span className="font-extrabold text-gray-900 text-xs">{datePart}</span>
                            <span className="text-[11px] text-gray-500 font-semibold">{timePart}</span>
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
          <div className="bg-white border-t border-gray-200 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-gray-800 flex-shrink-0">
            <div>
              Showing {filteredVulns.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredVulns.length)} of {filteredVulns.length} Vulnerabilities
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="hover:text-blue-600 font-bold disabled:opacity-40 disabled:hover:text-gray-800 px-1"
              >
                ◄
              </button>
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-2 py-0.5 rounded-md transition ${
                      currentPage === pageNum
                        ? 'bg-navy-800 text-white font-extrabold'
                        : 'hover:bg-gray-100 text-gray-700 font-bold'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="hover:text-blue-600 font-bold disabled:opacity-40 disabled:hover:text-gray-800 px-1"
              >
                ►
              </button>
            </div>
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
