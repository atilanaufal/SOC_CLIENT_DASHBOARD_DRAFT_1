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
import { Incident } from '@/lib/mock-data';
import { fetchIncidents } from '@/lib/api-client';
import { IncidentDetailDrawer } from '@/components/drawers/IncidentDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { useTimeFilter } from '@/lib/time-filter-context';

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

function IncidentsContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('agent') || '';

  const { timeFilter, customRange, metrics } = useTimeFilter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
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
      const data = await fetchIncidents({
        timeRange: timeFilter,
        startDate: customRange?.startDate,
        endDate: customRange?.endDate,
      });
      setIncidents(data);
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
      { key: 'incidentType', label: 'Incident Type', type: 'buttons', options: types },
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

  // Compute real counts & deltas for KPI from real MongoDB incidents data (1 document = 1 incident)
  const kpiCounts = useMemo(() => {
    let c = 0, h = 0, m = 0;
    let cPrev = 0, hPrev = 0, mPrev = 0;

    const now = new Date();
    const lowerFilter = (timeFilter || 'today').toLowerCase();

    let startOfCurrent: Date;
    let startOfPrevious: Date;
    let endOfPrevious: Date;

    if (lowerFilter === 'today') {
      startOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startOfPrevious = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endOfPrevious = startOfCurrent;
    } else if (lowerFilter === 'this week' || lowerFilter === '7d') {
      startOfCurrent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startOfPrevious = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      endOfPrevious = startOfCurrent;
    } else if (lowerFilter === 'this month' || lowerFilter === '30d') {
      startOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endOfPrevious = startOfCurrent;
    } else {
      startOfCurrent = new Date(0);
      startOfPrevious = new Date(0);
      endOfPrevious = new Date(0);
    }

    displayableIncidents.forEach((i: any) => {
      const sev = String(i.severity || '').toLowerCase();
      const rawDate = i.last_observed || i.first_observed || i.raw_first_observed || i.date;
      const d = rawDate ? new Date(rawDate) : null;

      const isCurrent = !d || isNaN(d.getTime()) || (lowerFilter === 'all' ? true : (d >= startOfCurrent));
      const isPrevious = lowerFilter !== 'all' && d && !isNaN(d.getTime()) && (d >= startOfPrevious && d < endOfPrevious);

      if (isCurrent) {
        if (sev === 'critical') c++;
        else if (sev === 'high') h++;
        else if (sev === 'medium') m++;
      }

      if (isPrevious) {
        if (sev === 'critical') cPrev++;
        else if (sev === 'high') hPrev++;
        else if (sev === 'medium') mPrev++;
      }
    });

    return {
      critical: c,
      criticalPrev: cPrev,
      criticalDelta: c - cPrev,
      high: h,
      highPrev: hPrev,
      highDelta: h - hPrev,
      medium: m,
      mediumPrev: mPrev,
      mediumDelta: m - mPrev,
    };
  }, [displayableIncidents, timeFilter]);

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
        <span className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-md font-black text-xs flex items-center gap-0.5">
          <HiOutlineArrowUp className="w-3.5 h-3.5 stroke-[3]" /> +{delta}
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-md font-black text-xs flex items-center gap-0.5">
          <HiOutlineArrowDown className="w-3.5 h-3.5 stroke-[3]" /> {delta}
        </span>
      );
    }
    return (
      <span className="bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-md font-black text-xs flex items-center gap-0.5">
        <HiOutlineMinus className="w-3.5 h-3.5 stroke-[3]" /> 0
      </span>
    );
  };

  const renderTrendComparison = (current: number, previous: number) => {
    const diff = current - previous;
    if (diff > 0) {
      return (
        <div className="flex items-center gap-1 text-xs font-black text-red-600 font-sans" title={`Data periode sebelumnya: ${previous}`}>
          <HiOutlineArrowTrendingUp className="w-4 h-4 text-red-600 stroke-[2.5]" />
          <span>{previous}</span>
        </div>
      );
    }
    if (diff < 0) {
      return (
        <div className="flex items-center gap-1 text-xs font-black text-emerald-600 font-sans" title={`Data periode sebelumnya: ${previous}`}>
          <HiOutlineArrowTrendingDown className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
          <span>{previous}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs font-black text-gray-500 font-sans" title={`Data periode sebelumnya: ${previous}`}>
        <HiOutlineMinus className="w-4 h-4 text-gray-400 stroke-[3]" />
        <span>{previous}</span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-row gap-3 w-full overflow-hidden">
      {/* Left Container: KPI Card + Search Bar + Table */}
      <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0 h-full overflow-hidden">
        {/* Top Clean KPI Summary Card */}
        <div className="bg-white rounded-md border border-gray-200 p-4 flex-shrink-0 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            {/* Critical Column */}
            <div className="md:pr-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="bg-[#FF1E1E] text-white text-xs font-black px-2.5 py-0.5 rounded-md">
                    Critical
                  </span>
                  {renderDeltaBadge(kpiCounts.criticalDelta)}
                </div>
                {renderTrendComparison(kpiCounts.critical, kpiCounts.criticalPrev)}
              </div>
              <p className="text-3xl font-black text-[#FF1E1E] tracking-tight">{kpiCounts.critical}</p>
            </div>

            {/* High Column */}
            <div className="md:px-4 pt-2 md:pt-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="bg-[#FF6B00] text-white text-xs font-black px-2.5 py-0.5 rounded-md">
                    High
                  </span>
                  {renderDeltaBadge(kpiCounts.highDelta)}
                </div>
                {renderTrendComparison(kpiCounts.high, kpiCounts.highPrev)}
              </div>
              <p className="text-3xl font-black text-[#FF6B00] tracking-tight">{kpiCounts.high}</p>
            </div>

            {/* Medium Column */}
            <div className="md:pl-4 pt-2 md:pt-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="bg-[#FFC700] text-white text-xs font-black px-2.5 py-0.5 rounded-md">
                    Medium
                  </span>
                  {renderDeltaBadge(kpiCounts.mediumDelta)}
                </div>
                {renderTrendComparison(kpiCounts.medium, kpiCounts.mediumPrev)}
              </div>
              <p className="text-3xl font-black text-[#FFC700] tracking-tight">{kpiCounts.medium}</p>
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
                placeholder="Search Incident / Agent / IP"
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
                  <th onClick={() => handleSort('incidentName')} className="w-[45%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Incident</span>
                      {renderSortIndicator('incidentName')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="w-[15%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('agent')} className="w-[20%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>Agent</span>
                      {renderSortIndicator('agent')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('firstObserved')} className="w-[20%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                    <div className="flex items-center">
                      <span>First Observed</span>
                      {renderSortIndicator('firstObserved')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs font-semibold">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center font-bold text-gray-500">
                      Loading incidents from database...
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
                      No incidents found for the selected filter ({timeFilter}).
                    </td>
                  </tr>
                ) : (
                  paginatedIncidents.map((inc) => {
                    const isSelected = isDrawerOpen && selectedIncident?.id === inc.id;
                    const parts = (inc.firstObserved || '').split(' ');
                    const datePart = parts.slice(0, 3).join(' ');
                    const timePart = parts.slice(3).join(' ');

                    return (
                      <tr
                        key={inc.id}
                        onClick={() => handleToggleDetail(inc)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-100/80 border-l-4 border-l-navy-800'
                            : 'hover:bg-blue-50/50'
                        }`}
                      >
                        <td className="py-2 px-3.5 text-gray-900 font-extrabold">
                          <div className="flex items-center gap-2">
                            <HiOutlineShieldExclamation className="w-4 h-4 text-navy-800 flex-shrink-0" />
                            <span className="truncate">{inc.incidentName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3.5 font-bold">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
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
                        <td className="py-2 px-3.5 text-navy-800 font-extrabold">{inc.agent}</td>
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
              Showing {filteredIncidents.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredIncidents.length)} of {filteredIncidents.length} Incidents
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
                className="hover:text-currentPage === totalPages"
              >
                ►
              </button>
            </div>
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
