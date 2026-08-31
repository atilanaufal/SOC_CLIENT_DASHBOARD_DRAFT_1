'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlass,
  HiOutlineAdjustmentsHorizontal,
  HiChevronUp,
  HiChevronDown,
} from 'react-icons/hi2';
import { SecurityReport } from '@/lib/types';
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
  if (s === 'critical') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-[#FDE8E8] text-[#B8251B] border border-[#F8B4B4]">Critical</span>;
  if (s === 'high') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]">High</span>;
  if (s === 'medium') return <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black bg-[#EBF5FF] text-[#1E429F] border border-[#BFDBFE]">Medium</span>;
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
        startDate: customRange?.startDate || undefined,
        endDate: customRange?.endDate || undefined,
      });
      setReports(data || []);

      if (targetReportId && data && data.length > 0) {
        const found = data.find((r) => r.id === targetReportId || String(r.report_id) === targetReportId);
        if (found) {
          setSelectedReport(found);
          setIsDrawerOpen(true);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reports');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeFilter, customRange, targetReportId]);

  const filterSections: FilterSection[] = useMemo(() => {
    const severities = Array.from(new Set(reports.map((r) => r.severity).filter(Boolean)));

    return [
      {
        key: 'severity',
        label: 'Severity Level',
        type: 'buttons',
        options: severities.length ? severities : ['Critical', 'High', 'Medium'],
      },
    ];
  }, [reports]);

  const handleApplyFilters = (filters: Record<string, string>) => {
    setActiveFilters(filters);
    setCurrentPage(1);
  };

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Search
      const search = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        r.reportName.toLowerCase().includes(search) ||
        (r.summary && r.summary.toLowerCase().includes(search)) ||
        (r.recommendedAction && r.recommendedAction.toLowerCase().includes(search));

      if (!matchSearch) return false;

      // Filter
      if (activeFilters.severity && activeFilters.severity !== 'All') {
        if (r.severity.toLowerCase() !== activeFilters.severity.toLowerCase()) return false;
      }

      return true;
    });
  }, [reports, searchTerm, activeFilters]);

  // Handle Sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      let aVal = a[sortKey] || '';
      let bVal = b[sortKey] || '';

      if (sortKey === 'severity') {
        const severityWeight: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
          unspecified: 0,
        };
        const aWeight = severityWeight[String(aVal).toLowerCase()] || 0;
        const bWeight = severityWeight[String(bVal).toLowerCase()] || 0;
        return sortDirection === 'asc' ? aWeight - bWeight : bWeight - aWeight;
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
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Left Container: KPI Card + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[392px] 2xl:mr-[456px] min-h-0" : ""}`}>

        {/* KPI */}
        <div className="max-w-md bg-white/70 backdrop-blur-xl p-3 sm:p-3.5 2xl:p-4 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-3 sm:gap-3.5 2xl:gap-4 flex-shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 2xl:w-14 2xl:h-14 rounded-xl bg-[#002B9A]/95 backdrop-blur-sm text-white flex items-center justify-center font-black text-xs border border-white/20 shadow-[0_4px_12px_rgba(0,43,154,0.3)]">
            <HiOutlineDocumentText className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-7 2xl:h-7 text-blue-300" />
          </div>
          <div>
            <h4 className="font-black text-xs sm:text-sm 2xl:text-base text-gray-900">Total Reports</h4>
            <p className="text-xl sm:text-2xl 2xl:text-3xl font-black text-[#002B9A]">
              {filteredReports.length} <span className="text-[11px] sm:text-xs 2xl:text-sm font-bold text-gray-500 uppercase tracking-wider">Available</span>
            </p>
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
                placeholder="Search Reports"
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
            <span className="font-bold">Refresh</span>
          </button>
        </div>

        {/* Data Table Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="sticky top-0 z-10 bg-[#002B9A] text-white select-none">
                <tr className="bg-[#002B9A] text-white text-[11px] sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-black tracking-wider border-b border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <th onClick={() => handleSort('reportName')} className="bg-[#002B9A] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Report Name</span>
                      {renderSortIndicator('reportName')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('severity')} className="bg-[#002B9A] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Severity</span>
                      {renderSortIndicator('severity')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('dateGenerated')} className="bg-[#002B9A] py-2 sm:py-2.5 xl:py-3.5 2xl:py-4 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 cursor-pointer hover:bg-[#002175] transition">
                    <div className="flex items-center text-white">
                      <span>Date Generated</span>
                      {renderSortIndicator('dateGenerated')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs sm:text-xs md:text-xs xl:text-sm 2xl:text-base font-semibold">
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
                  paginatedReports.map((report) => {
                    const isSelected = Boolean(isDrawerOpen && selectedReport?.id === report.id);
                    const parts = (report.dateGenerated || '').split(' ');
                    const datePart = parts.slice(0, 3).join(' ');
                    const timePart = parts.slice(3).join(' ');

                    return (
                      <tr
                        key={report.id}
                        onClick={() => handleToggleDetail(report)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-100/80'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        <td className="relative py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 text-[#002B9A] font-black">
                          {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                          <span>{report.reportName}</span>
                        </td>
                        <td className="py-2 sm:py-2.5 xl:py-3 2xl:py-3.5 px-2.5 sm:px-3.5 xl:px-4 2xl:px-5 font-bold">
                          {renderSeverityBadge(report.severity)}
                        </td>
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

      {/* Slide-out Drawer */}
      <ReportDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedReport(null);
        }}
        report={selectedReport}
        onOpenFullSummary={(rep) => setSelectedFullReport(rep)}
      />

      {/* Full Screen Report Detail Modal */}
      <ReportDetailsModal
        isOpen={Boolean(selectedFullReport)}
        onClose={() => setSelectedFullReport(null)}
        report={selectedFullReport}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filter Reports"
        sections={filterSections}
        initialFilters={activeFilters}
        onApply={handleApplyFilters}
      />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm font-bold text-gray-500">Loading reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
