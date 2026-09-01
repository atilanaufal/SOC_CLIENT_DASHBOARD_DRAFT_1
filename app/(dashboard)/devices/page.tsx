'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiChevronUp,
  HiChevronDown,
} from 'react-icons/hi2';
import { Device } from '@/lib/types';
import { fetchDevices, fetchDeviceRiskScores } from '@/lib/api-client';
import { DeviceDetailDrawer } from '@/components/drawers/DeviceDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { BestDonutChart } from '@/components/charts/BestDonutChart';
import { useTimeFilter } from '@/lib/time-filter-context';
import { Pagination } from '@/components/ui/Pagination';
import { formatDateTimeAndAgo, getTimestamp } from '@/lib/date-utils';

type SortKey = 'agent' | 'os' | 'status' | 'score' | 'lastSeen';
type SortDirection = 'asc' | 'desc';

function getRiskCategory(score: number): { label: string; color: string; meaning: string } {
  if (score >= 80) {
    return { label: 'Critical', color: '#B8251B', meaning: 'Emergency mitigation required' };
  } else if (score >= 60) {
    return { label: 'High', color: '#EA580C', meaning: 'Urgent security attention required' };
  } else if (score >= 40) {
    return { label: 'Medium', color: '#5B9BD5', meaning: 'Scheduled attention and patching required' };
  } else {
    return { label: 'Low', color: '#16A34A', meaning: 'Condition relatively safe and monitored' };
  }
}

function DevicesContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const { timeFilter, customRange } = useTimeFilter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Interactive Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Real-time Database fetch
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDevices();
      const loadedAgents = res.data || [];
      setDevices(loadedAgents);
      setLoading(false);

      // Fetch Incident Risk Scores & Severity Breakdown per agent based on time filter
      fetchDeviceRiskScores(timeFilter, customRange)
        .then((riskRes) => {
          const scoresMap = riskRes.scoresMap || {};
          setDevices((prevDevices) =>
            prevDevices.map((dev) => {
              const idKey = String(dev.id).trim().toLowerCase();
              const nameKey = String(dev.agent).trim().toLowerCase();
              const ipKey = String(dev.ipAddress || '').trim().toLowerCase();

              const stats =
                scoresMap[idKey] ||
                scoresMap[nameKey] ||
                (ipKey ? scoresMap[ipKey] : null);

              if (stats) {
                return {
                  ...dev,
                  criticalCount: stats.criticalCount || 0,
                  highCount: stats.highCount || 0,
                  mediumCount: stats.mediumCount || 0,
                  lowCount: stats.lowCount || 0,
                  score: stats.score || 0,
                  riskCategory: stats.riskCategory || 'Low',
                  risk: `${stats.riskCategory || 'Low'} (${stats.score || 0})`,
                  detectedIssues: stats.detectedIssues || [],
                };
              }

              return {
                ...dev,
                criticalCount: 0,
                highCount: 0,
                mediumCount: 0,
                lowCount: 0,
                score: 0,
                riskCategory: 'Low',
                risk: 'Low (0)',
                detectedIssues: [],
              };
            })
          );
        })
        .catch((err) => {
          console.warn('[Devices] Failed to fetch device risk scores:', err);
        });
    } catch (err: any) {
      console.error('Error fetching live devices from API:', err);
      setError(err.message || 'Gagal memuat perangkat dari database.');
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
      setSortDirection(key === 'score' || key === 'lastSeen' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const dynamicFilterSections: FilterSection[] = useMemo(() => {
    const rawStatuses = Array.from(new Set(devices.map((d) => d.status))).filter(Boolean);
    const rawOs = Array.from(new Set(devices.map((d) => d.os))).filter(Boolean);

    return [
      {
        key: 'status',
        label: 'Status Perangkat',
        type: 'buttons',
        options: rawStatuses.length ? rawStatuses : ['Online', 'Offline'],
      },
      {
        key: 'os',
        label: 'Sistem Operasi (OS)',
        type: 'select',
        options: rawOs.length ? rawOs : ['Ubuntu', 'Windows', 'Debian'],
      },
    ];
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return devices.filter((dev) => {
      // Match text search across agent name, OS, and IP
      const q = searchTerm.toLowerCase().trim();
      if (q) {
        const matchName = dev.agent.toLowerCase().includes(q);
        const matchOs = dev.os.toLowerCase().includes(q);
        const matchIp = (dev.ipAddress || '').toLowerCase().includes(q);
        const matchId = String(dev.id).toLowerCase().includes(q);
        if (!matchName && !matchOs && !matchIp && !matchId) return false;
      }

      // Match dynamic filters
      if (activeFilters.status && activeFilters.status !== 'All') {
        if (dev.status.toLowerCase() !== activeFilters.status.toLowerCase()) return false;
      }
      if (activeFilters.os && activeFilters.os !== 'All') {
        if (dev.os !== activeFilters.os) return false;
      }

      return true;
    });
  }, [devices, searchTerm, activeFilters]);

  // Accumulated severity breakdown across all agents for Devices At Risk KPI
  const totalCritical = useMemo(
    () => devices.reduce((sum, d) => sum + (d.criticalCount || 0), 0),
    [devices]
  );
  const totalHigh = useMemo(
    () => devices.reduce((sum, d) => sum + (d.highCount || 0), 0),
    [devices]
  );
  const totalMedium = useMemo(
    () => devices.reduce((sum, d) => sum + (d.mediumCount || 0), 0),
    [devices]
  );

  const sortedDevices = useMemo(() => {
    return [...filteredDevices].sort((a, b) => {
      if (sortKey === 'score') {
        const rawA = (a.criticalCount || 0) * 10 + (a.highCount || 0) * 6 + (a.mediumCount || 0) * 3;
        const scoreA = typeof a.score === 'number' ? a.score : Math.min(100, rawA);
        const rawB = (b.criticalCount || 0) * 10 + (b.highCount || 0) * 6 + (b.mediumCount || 0) * 3;
        const scoreB = typeof b.score === 'number' ? b.score : Math.min(100, rawB);
        return sortDirection === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      }
      if (sortKey === 'lastSeen') {
        const timeA = getTimestamp((a as any).lastSeenDate || a.lastSeen);
        const timeB = getTimestamp((b as any).lastSeenDate || b.lastSeen);
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
      const valA = (a[sortKey] || '').toString().toLowerCase();
      const valB = (b[sortKey] || '').toString().toLowerCase();
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredDevices, sortKey, sortDirection]);

  const totalPages = Math.ceil(sortedDevices.length / pageSize) || 1;
  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDevices.slice(start, start + pageSize);
  }, [sortedDevices, currentPage, pageSize]);

  const handleApplyFilters = (filters: Record<string, string>) => {
    setActiveFilters(filters);
    setCurrentPage(1);
  };

  const activeCount = Object.keys(activeFilters).filter((k) => activeFilters[k] && activeFilters[k] !== 'All').length;

  const handleToggleDetail = (dev: Device) => {
    if (selectedDevice?.id === dev.id && isDrawerOpen) {
      setIsDrawerOpen(false);
      setSelectedDevice(null);
    } else {
      setSelectedDevice(dev);
      setIsDrawerOpen(true);
    }
  };

  const osChartSegments = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach((d) => {
      if (d.os) {
        let label = d.os;
        if (label.toLowerCase().includes('ubuntu')) label = 'Ubuntu';
        else if (label.toLowerCase().includes('windows')) label = 'Windows';
        else if (label.toLowerCase().includes('fedora')) label = 'Fedora';
        else if (label.toLowerCase().includes('freebsd')) label = 'FreeBSD';
        else if (label.toLowerCase().includes('debian')) label = 'Debian';
        else if (label.toLowerCase().includes('arch')) label = 'Arch Linux';
        else if (label.toLowerCase().includes('amazon')) label = 'Amazon Linux';
        else if (label.toLowerCase().includes('centos')) label = 'CentOS';
        counts[label] = (counts[label] || 0) + 1;
      }
    });
    const colors = ['#3B82F6', '#A855F7', '#F97316', '#10B981', '#F59E0B', '#6366F1'];
    return Object.entries(counts).map(([label, value], i) => ({
      label,
      value,
      color: colors[i % colors.length],
    }));
  }, [devices]);

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? (
      <HiChevronUp className="w-3.5 h-3.5 ml-1 inline text-blue-300" />
    ) : (
      <HiChevronDown className="w-3.5 h-3.5 ml-1 inline text-blue-300" />
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row gap-3 min-w-0 items-stretch">
      {/* Container: KPI Cards + Search Bar + Table */}
      <div className={`flex-1 flex flex-col gap-3 min-w-0 w-full ${isDrawerOpen ? "lg:mr-[402px] xl:mr-[442px] 2xl:mr-[492px]" : ""}`}>
        {/* Critical Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-900 px-3 py-2 rounded-md text-xs font-bold flex items-center justify-between flex-shrink-0">
            <span>❌ Error: {error}</span>
            <button
              onClick={() => loadData()}
              className="bg-red-800 text-white px-2.5 py-1 rounded text-[11px] font-bold hover:bg-red-900 transition cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Top KPI Cards (3 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 xl:gap-4 2xl:gap-5 flex-shrink-0">
          {/* Total Devices Card */}
          <div className="bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center justify-between">
            <div className="flex flex-col justify-between h-full gap-2">
              <p className="text-xs sm:text-xs xl:text-sm font-bold text-gray-500 uppercase tracking-wider">
                Total Devices
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-xs xl:text-sm font-bold">
                <span className="bg-emerald-100/90 backdrop-blur-sm text-emerald-800 px-2.5 py-0.5 sm:py-1 rounded-md border border-emerald-300 shadow-sm">
                  {filteredDevices.filter((d) => d.status === 'Online').length} Online
                </span>
                <span className="bg-red-100/90 backdrop-blur-sm text-red-800 px-2.5 py-0.5 sm:py-1 rounded-md border border-red-300 shadow-sm">
                  {filteredDevices.filter((d) => d.status === 'Offline').length} Offline
                </span>
              </div>
            </div>
            <p className="text-3xl sm:text-4xl md:text-4xl xl:text-5xl font-black text-gray-900 tracking-tight leading-none">
              {filteredDevices.length}
            </p>
          </div>

          {/* Top OS Distribution */}
          <div className="bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex items-center gap-3">
            <BestDonutChart
              segments={osChartSegments.length ? osChartSegments : [{ label: 'No OS', value: 1, color: '#9CA3AF' }]}
              centerLabel=""
              size={75}
              strokeWidth={10}
            />
            <div className="flex-1 text-xs sm:text-xs xl:text-sm space-y-1 overflow-hidden">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 border-b border-gray-200/50 pb-0.5">
                Top OS Distribution
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-bold text-gray-700 text-xs">
                {osChartSegments.slice(0, 4).map((seg) => (
                  <span key={seg.label} className="flex items-center gap-1 truncate" title={`${seg.label}: ${seg.value}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }}></span>
                    <span className="truncate">{seg.label}</span> ({seg.value})
                  </span>
                ))}
                {osChartSegments.length === 0 && <span className="text-gray-400 font-normal">Tidak ada data OS</span>}
              </div>
            </div>
          </div>

          {/* Devices At Risk ! */}
          <div className="bg-white/70 backdrop-blur-xl p-3.5 sm:p-4 xl:p-5 rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex flex-col justify-between gap-2">
            <p className="text-xs sm:text-xs xl:text-sm font-bold text-gray-500 uppercase tracking-wider">
              Devices At Risk !
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-xs font-bold">
              <div className="text-center bg-[#FDE8E8]/90 backdrop-blur-sm p-1.5 sm:p-2 rounded-lg border border-[#F8B4B4] shadow-sm flex flex-col justify-center">
                <span className="block text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">Critical</span>
                <span className="text-[#B8251B] text-base sm:text-lg font-black">{totalCritical}</span>
              </div>
              <div className="text-center bg-[#FFEDD5]/90 backdrop-blur-sm p-1.5 sm:p-2 rounded-lg border border-[#FDBA74] shadow-sm flex flex-col justify-center">
                <span className="block text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">High</span>
                <span className="text-[#C2410C] text-base sm:text-lg font-black">{totalHigh}</span>
              </div>
              <div className="text-center bg-[#EBF5FF]/90 backdrop-blur-sm p-1.5 sm:p-2 rounded-lg border border-[#BFDBFE] shadow-sm flex flex-col justify-center">
                <span className="block text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">Medium</span>
                <span className="text-[#1E429F] text-base sm:text-lg font-black">{totalMedium}</span>
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
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search Agent / OS / IP / ID"
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

          <button
            onClick={() => loadData()}
            className="bg-black/90 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-black transition border border-white/20 shadow-sm cursor-pointer whitespace-nowrap min-h-[38px] sm:w-auto"
          >
            <HiOutlineArrowPath className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Active Filter Badges */}
        {(activeCount > 0 || searchTerm.trim()) && (
          <div className="flex flex-wrap items-center gap-2 px-1 flex-shrink-0">
            <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
              Active Filters:
            </span>
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
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove status filter"
                >
                  <HiOutlineXMark className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </span>
            )}
            {activeFilters.os && activeFilters.os !== 'All' && (
              <span className="inline-flex items-center gap-1.5 bg-white text-[#0066B1] border-2 border-[#0066B1]/60 px-3 py-1 rounded-lg text-xs font-black shadow-[0_2px_8px_rgba(0,102,177,0.12)]">
                <span>OS: <strong className="text-[#0066B1] font-black">{activeFilters.os}</strong></span>
                <button
                  onClick={() => {
                    setActiveFilters((prev) => {
                      const next = { ...prev };
                      delete next.os;
                      return next;
                    });
                    setCurrentPage(1);
                  }}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition cursor-pointer ml-0.5"
                  title="Remove OS filter"
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

        {/* Devices Data Container */}
        <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-gray-500">
              Memuat perangkat...
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="py-12 text-center text-xs sm:text-sm font-bold text-gray-500">
              Tidak ada perangkat yang sesuai dengan filter atau pencarian.
            </div>
          ) : (
            <>
              {/* MOBILE CARD LIST VIEW (Phones: < md) */}
              <div className="block md:hidden divide-y divide-gray-100 p-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                {paginatedDevices.map((dev) => {
                  const raw = (dev.criticalCount || 0) * 10 + (dev.highCount || 0) * 6 + (dev.mediumCount || 0) * 3;
                  const scoreVal = typeof dev.score === 'number' ? dev.score : Math.min(100, raw);
                  const cat = getRiskCategory(scoreVal);
                  const isSelected = isDrawerOpen && selectedDevice?.id === dev.id;
                  const { dateTime, timeAgo } = formatDateTimeAndAgo(dev.lastSeen);

                  return (
                    <div
                      key={dev.id}
                      onClick={() => handleToggleDetail(dev)}
                      className={`p-3 rounded-xl transition cursor-pointer mb-2 border ${
                        isSelected
                          ? 'bg-blue-50/90 border-[#002B9A]/30 shadow-sm'
                          : 'bg-white/80 hover:bg-blue-50/50 border-white/80 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-extrabold text-[#002B9A] break-all">{dev.agent}</span>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${
                            dev.status === 'Online'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-red-100 text-red-800 border border-red-300'
                          }`}
                        >
                          {dev.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">{dev.os}</span>
                        {dev.ipAddress && <span className="text-gray-500 font-mono">IP: {dev.ipAddress}</span>}
                      </div>

                      {/* Severity breakdown pills */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs mb-2">
                        {dev.criticalCount ? (
                          <span className="bg-[#FDE8E8] text-[#B8251B] px-2 py-0.5 rounded-md border border-[#F8B4B4] font-bold">
                            Critical: {dev.criticalCount}
                          </span>
                        ) : null}
                        <span className="bg-[#FFEDD5] text-[#C2410C] px-2 py-0.5 rounded-md border border-[#FDBA74] font-bold">
                          High: {dev.highCount || 0}
                        </span>
                        <span className="bg-[#EBF5FF] text-[#1E429F] px-2 py-0.5 rounded-md border border-[#BFDBFE] font-bold">
                          Medium: {dev.mediumCount || 0}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className="text-gray-500">Risk Score:</span>
                          <span className="text-gray-900 font-black">{scoreVal}</span>
                          <span
                            style={{ backgroundColor: cat.color }}
                            className="text-white text-xs font-bold px-2 py-0.5 rounded shadow-sm"
                          >
                            {cat.label}
                          </span>
                        </div>
                        <div className="text-right text-gray-500 text-[11px] font-medium">
                          <span>{timeAgo || dateTime}</span>
                        </div>
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
                      <th onClick={() => handleSort('agent')} className="bg-[#002B9A] w-[20%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Agent Name</span>
                          {renderSortIndicator('agent')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('os')} className="bg-[#002B9A] w-[18%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Operating System</span>
                          {renderSortIndicator('os')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('status')} className="bg-[#002B9A] w-[12%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Status</span>
                          {renderSortIndicator('status')}
                        </div>
                      </th>
                      <th className="bg-[#002B9A] w-[20%] py-3 px-3.5 xl:px-4">
                        <div className="flex items-center text-white">
                          <span>Severity Breakdown</span>
                        </div>
                      </th>
                      <th onClick={() => handleSort('score')} className="bg-[#002B9A] w-[15%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Risk Score</span>
                          {renderSortIndicator('score')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('lastSeen')} className="bg-[#002B9A] w-[15%] py-3 px-3.5 xl:px-4 cursor-pointer hover:bg-[#002175] transition">
                        <div className="flex items-center text-white">
                          <span>Last Seen</span>
                          {renderSortIndicator('lastSeen')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-xs sm:text-sm font-normal">
                    {paginatedDevices.map((dev) => {
                      const raw = (dev.criticalCount || 0) * 10 + (dev.highCount || 0) * 6 + (dev.mediumCount || 0) * 3;
                      const scoreVal = typeof dev.score === 'number' ? dev.score : Math.min(100, raw);
                      const cat = getRiskCategory(scoreVal);
                      const isSelected = isDrawerOpen && selectedDevice?.id === dev.id;
                      const { dateTime, timeAgo } = formatDateTimeAndAgo(dev.lastSeen);

                      return (
                        <tr
                          key={dev.id}
                          onClick={() => handleToggleDetail(dev)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? 'bg-blue-100/80'
                              : 'hover:bg-blue-50/40'
                          }`}
                        >
                          <td className="relative py-3 px-3.5 xl:px-4 text-[#0066B1] font-bold">
                            {isSelected && <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#002B9A]" />}
                            <div className="flex items-center gap-2">
                              <span>{dev.agent}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 xl:px-4 text-gray-800 font-medium">{dev.os}</td>
                          <td className="py-3 px-3.5 xl:px-4 font-bold">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                                dev.status === 'Online'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-red-100 text-red-800 border border-red-300'
                              }`}
                            >
                              {dev.status}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 xl:px-4 font-bold">
                            <div className="flex items-center gap-1.5 text-xs">
                              {dev.criticalCount ? (
                                <span className="bg-[#FDE8E8] text-[#B8251B] px-2 py-0.5 rounded border border-[#F8B4B4] font-bold">
                                  Critical: {dev.criticalCount}
                                </span>
                              ) : null}
                              <span className="bg-[#FFEDD5] text-[#C2410C] px-2 py-0.5 rounded border border-[#FDBA74] font-bold">
                                High: {dev.highCount || 0}
                              </span>
                              <span className="bg-[#EBF5FF] text-[#1E429F] px-2 py-0.5 rounded border border-[#BFDBFE] font-bold">
                                Medium: {dev.mediumCount || 0}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 xl:px-4">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="text-xs sm:text-sm text-gray-900 font-bold">{scoreVal}</span>
                              <span
                                style={{ backgroundColor: cat.color }}
                                className="text-white text-xs font-bold px-2 py-0.5 rounded shadow-sm flex-shrink-0"
                                title={cat.meaning}
                              >
                                {cat.label}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 xl:px-4 text-gray-900 font-medium">
                            <div className="flex flex-col leading-tight">
                              <span className="font-semibold text-xs sm:text-sm">{dateTime}</span>
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
            <div>
              Showing {filteredDevices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredDevices.length)} of {filteredDevices.length} Devices
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
      <DeviceDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedDevice(null);
        }}
        device={selectedDevice}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filter Perangkat"
        sections={dynamicFilterSections}
        initialFilters={activeFilters}
        onApply={handleApplyFilters}
      />
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm font-semibold text-gray-500">Loading devices...</div>}>
      <DevicesContent />
    </Suspense>
  );
}
