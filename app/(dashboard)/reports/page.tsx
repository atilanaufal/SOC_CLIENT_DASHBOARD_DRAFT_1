'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineDocumentText,
  HiOutlineAdjustmentsHorizontal,
  HiChevronUp,
  HiChevronDown
} from 'react-icons/hi2';
import { SecurityReport } from '@/lib/mock-data';
import { fetchReports } from '@/lib/api-client';
import { ReportDetailDrawer } from '@/components/drawers/ReportDetailDrawer';
import { ReportDetailsModal } from '@/components/modals/ReportDetailsModal';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { useTimeFilter } from '@/lib/time-filter-context';
import { Pagination } from '@/components/ui/Pagination';

type SortKey = 'reportName' | 'severity' | 'dateGenerated';
type SortDirection = 'asc' | 'desc';

function renderSeverityBadge(sev: string) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-red-100 text-red-800 border border-red-300">Critical</span>;
  if (s === 'high') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-300">High</span>;
  if (s === 'medium') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">Medium</span>;
  if (s === 'low') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300">Low</span>;
  return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-slate-100 text-slate-800 border border-slate-300">Info</span>;
}

function ReportsContent() {
  const searchParams = useSearchParams();
  const targetReportId = searchParams.get('reportId');

  const { timeFilter, customRange } = useTimeFilter();
  const [reports, setReports] = useState<SecurityReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SecurityReport | null>(null);
  const [selectedFullReport, setSelectedFullReport] = useState<SecurityReport | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('dateGenerated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchReports({
        timeRange: timeFilter,
        startDate: customRange?.startDate,
        endDate: customRange?.endDate,
      });
      setReports(data);
    } catch (err: any) {
      console.error('Failed to load reports:', err);
      setError(err.message || 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeFilter, customRange]);

  useEffect(() => {
    if (targetReportId && reports.length > 0) {
      const found = reports.find((r) => r.id === targetReportId || r.report_id === Number(targetReportId) || r._id === targetReportId);
      if (found) {
        setSelectedReport(found);
        setIsDrawerOpen(true);
      }
    }
  }, [targetReportId, reports]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      if (key === 'dateGenerated') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
  };

  const adaptiveFilterSections: FilterSection[] = useMemo(() => {
    const severities = Array.from(new Set(reports.map((r) => r.severity))).filter(Boolean);

    return [
      { key: 'severity', label: 'Severity Level', type: 'buttons', options: severities.length ? severities : ['Critical', 'High', 'Medium'] },
    ];
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((rep) => {
      const matchesSearch =
        rep.reportName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rep.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rep.recommendedAction && rep.recommendedAction.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSeverity =
        !activeFilters.severity || activeFilters.severity === 'All'
          ? true
          : String(rep.severity || '').toLowerCase() === activeFilters.severity.toLowerCase();

      return matchesSearch && matchesSeverity;
    });
  }, [reports, searchTerm, activeFilters]);

  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a: any, b: any) => {
      if (sortKey === 'dateGenerated') {
        const getTime = (r: any) => {
          const raw = r.date_generated || r.dateGenerated || r.created_at || r.date;
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
        const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, informational: 0, info: 0 };
        aVal = order[String(aVal).toLowerCase()] || 0;
        bVal = order[String(bVal).toLowerCase()] || 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredReports, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedReports.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedReports = sortedReports.slice(startIndex, startIndex + pageSize);

  const handleToggleDetail = (report: SecurityReport) => {
    if (isDrawerOpen && selectedReport?.id === report.id) {
      setIsDrawerOpen(false);
      setSelectedReport(null);
    } else {
      setSelectedReport(report);
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

  return (
    <div className="w-full flex flex-col lg:flex-row gap-3 min-w-0">
      {/* Left Container: KPI Card + Search Bar + Table */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 w-full">
        {/* KPI */}
        <div className="max-w-md bg-white/70 backdrop-blur-xl p-3.5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-3.5 flex-shrink-0">
          <div className="w-12 h-12 rounded-xl bg-[#002B9A]/95 backdrop-blur-sm text-white flex items-center justify-center font-black text-xs border border-white/20 shadow-[0_4px_12px_rgba(0,43,154,0.3)]">
            <HiOutlineDocumentText className="w-6 h-6 text-blue-300" />
          </div>
          <div>
            <h4 className="font-black text-sm text-gray-900">Total Reports</h4>
            <p className="text-2xl font-black text-[#002B9A]">
              {filteredReports.length} <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Available</span>
            </p>
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
                placeholder="Search Reports"
                className="w-full bg-white/75 backdrop-blur-md text-gray-900 placeholder-gray-400 border border-white/80 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#002B9A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
              />
            </div>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="bg-black/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
            >
              <HiOutlineAdjustmentsHorizontal className="w-4 h-4 text-blue-300" />
              <span>Filter{activeCount > 0 ? ` (${activeCount})` : ''}</span>
            </button>
          </div>

          <button
            onClick={() => loadData()}
            className="bg-black/90 backdrop-blur-sm text-white text-xs font-bold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          >
            <HiOutlineArrowPath className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Data Table Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#002B9A]/95 backdrop-blur-md text-white text-xs font-black tracking-wider sticky top-0 z-10 select-none border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <th onClick={() => handleSort('reportName')} className="py-2.5 px-3.5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center">
                      <span>Report Name</span>
                      {renderSortIndicator('reportName')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="py-2.5 px-3.5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('dateGenerated')} className="py-2.5 px-3.5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center">
                      <span>Date Generated</span>
                      {renderSortIndicator('dateGenerated')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs font-semibold">
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center font-bold text-gray-500">
                      Loading reports...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center font-bold text-red-600">
                      Error: {error}
                    </td>
                  </tr>
                ) : paginatedReports.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center font-bold text-gray-500">
                      No reports found.
                    </td>
                  </tr>
                ) : (
                  paginatedReports.map((rep) => {
                    const isSelected = isDrawerOpen && selectedReport?.id === rep.id;
                    const parts = (rep.dateGenerated || '').split(' ');
                    const datePart = parts.slice(0, 3).join(' ');
                    const timePart = parts.slice(3).join(' ');

                    return (
                      <tr
                        key={rep.id}
                        onClick={() => handleToggleDetail(rep)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-100/70 border-l-4 border-l-[#002B9A]' : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="py-2 px-3.5 text-gray-900 font-extrabold">
                          <div className="flex items-center gap-2">
                            <HiOutlineDocumentText className="w-4 h-4 text-[#002B9A] flex-shrink-0" />
                            <span>{rep.reportName}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3.5 font-bold">
                          {renderSeverityBadge(rep.severity)}
                        </td>

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
          <div className="bg-white/60 backdrop-blur-md border-t border-white/60 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-gray-800 flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]">
            <div>
              Showing {filteredReports.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredReports.length)} of {filteredReports.length} Reports
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
      <ReportDetailDrawer
        report={selectedReport}
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setSelectedReport(null); }}
        onOpenFullSummary={(rep) => setSelectedFullReport(rep)}
      />

      {/* Large Full Summary Modal */}
      <ReportDetailsModal
        report={selectedFullReport}
        isOpen={!!selectedFullReport}
        onClose={() => setSelectedFullReport(null)}
      />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={(filters) => { setActiveFilters(filters); setCurrentPage(1); }}
        initialFilters={activeFilters}
        sections={adaptiveFilterSections}
        title="Filter Reports"
      />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-4 font-bold text-gray-700">Loading Reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
