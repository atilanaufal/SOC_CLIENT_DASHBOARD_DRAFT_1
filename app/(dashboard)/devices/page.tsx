'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineComputerDesktop,
  HiOutlineServer,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineExclamationCircle,
  HiChevronUp,
  HiChevronDown,
} from 'react-icons/hi2';
import { Device } from '@/lib/mock-data';
import { fetchDevices, fetchDeviceRiskScores } from '@/lib/api-client';
import { DeviceDetailDrawer } from '@/components/drawers/DeviceDetailDrawer';
import { FilterModal, FilterSection } from '@/components/modals/FilterModal';
import { BestDonutChart } from '@/components/charts/BestDonutChart';
import { getRiskCategory } from '@/lib/risk-score';
import { useTimeFilter } from '@/lib/time-filter-context';

type SortKey = 'agent' | 'os' | 'status' | 'score' | 'lastSeen';
type SortDirection = 'asc' | 'desc';

function DevicesContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const initialHighlight = searchParams.get('highlight') || '';

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
  const [sortKey, setSortKey] = useState<SortKey>('agent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Fetch Wazuh API Agents FIRST (Fast < 50ms) -> Display Table Immediately!
      const res = await fetchDevices();
      const loadedAgents = res.data || [];
      setDevices(loadedAgents);
      setLoading(false); // Render UI immediately!

      // Step 2: Background Async Fetch for MongoDB Risk Scores & Severity Breakdown (Filtered by timeFilter)
      fetchDeviceRiskScores(timeFilter, customRange)
        .then((riskRes) => {
          if (!riskRes.mongoDbAvailable) {
            return;
          }

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
              // Reset if no incidents in current time filter
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
        .catch(() => {});
    } catch (err: any) {
      console.error('Failed to fetch devices:', err);
      setError(err.message || 'Failed to fetch devices data');
      setDevices([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeFilter, customRange]);

  useEffect(() => {
    if (initialSearch && devices.length > 0) {
      setSearchTerm(initialSearch);
      const matchedDevice = devices.find(
        (d) => d.agent.toLowerCase().includes(initialSearch.toLowerCase())
      );
      if (matchedDevice) {
        setSelectedDevice(matchedDevice);
        setIsDrawerOpen(true);
      }
    }
  }, [initialSearch, initialHighlight, devices]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const adaptiveFilterSections: FilterSection[] = useMemo(() => {
    const statuses = Array.from(new Set(devices.map((d) => d.status))).filter(Boolean);
    const osList = Array.from(new Set(devices.map((d) => d.os))).filter(Boolean);
    const agents = Array.from(new Set(devices.map((d) => d.agent))).filter(Boolean);

    return [
      { key: 'status', label: 'Status', type: 'buttons', options: statuses.length ? statuses : ['Online', 'Offline'] },
      { key: 'os', label: 'Operating System', type: 'select', options: osList },
      { key: 'agent', label: 'Agent', type: 'select', options: agents },
    ];
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const isExactAgentMatch = devices.some(
        (d) => d.agent.toLowerCase() === searchTerm.trim().toLowerCase()
      );

      const matchesSearch = isExactAgentMatch
        ? device.agent.toLowerCase() === searchTerm.trim().toLowerCase()
        : device.agent.toLowerCase().includes(searchTerm.toLowerCase()) ||
          device.os.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        !activeFilters.status || activeFilters.status === 'All'
          ? true
          : device.status === activeFilters.status;

      const matchesOS =
        !activeFilters.os || activeFilters.os === 'All'
          ? true
          : device.os === activeFilters.os;

      const matchesAgent =
        !activeFilters.agent || activeFilters.agent === 'All'
          ? true
          : device.agent === activeFilters.agent;

      return matchesSearch && matchesStatus && matchesOS && matchesAgent;
    });
  }, [devices, searchTerm, activeFilters]);

  // Accumulated severity breakdown across all filtered agents
  const totalCritical = useMemo(
    () => filteredDevices.reduce((sum, d) => sum + (d.criticalCount || 0), 0),
    [filteredDevices]
  );
  const totalHigh = useMemo(
    () => filteredDevices.reduce((sum, d) => sum + (d.highCount || 0), 0),
    [filteredDevices]
  );
  const totalMedium = useMemo(
    () => filteredDevices.reduce((sum, d) => sum + (d.mediumCount || 0), 0),
    [filteredDevices]
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
    <div className="h-full flex flex-row gap-3 w-full overflow-hidden">
      {/* Left Container: KPI Cards + Search Bar + Table */}
      <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0 h-full overflow-hidden">
        {/* Critical Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-900 px-3 py-2 rounded-md text-xs font-bold flex items-center justify-between flex-shrink-0">
            <span>❌ Error: {error}</span>
            <button
              onClick={() => loadData()}
              className="bg-red-800 text-white px-2.5 py-1 rounded text-[11px] font-black hover:bg-red-900 transition"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Top KPI Cards (3 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 flex-shrink-0">
          <div className="bg-white p-3.5 rounded-md border border-gray-200 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Total Devices</p>
              <p className="text-3xl font-black text-gray-900 mt-1 tracking-tight">{filteredDevices.length}</p>
              <div className="flex items-center gap-2 mt-1 text-xs font-black">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                  {filteredDevices.filter((d) => d.status === 'Online').length} Online
                </span>
                <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-300">
                  {filteredDevices.filter((d) => d.status === 'Offline').length} Offline
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-lg bg-navy-800 text-white flex items-center justify-center border border-navy-900 shadow-xs flex-shrink-0">
              <HiOutlineComputerDesktop className="w-6 h-6 text-blue-300" />
            </div>
          </div>

          <div className="bg-white p-3 rounded-md border border-gray-200 flex items-center gap-3 shadow-xs">
            <BestDonutChart
              segments={osChartSegments.length ? osChartSegments : [{ label: 'No OS', value: 1, color: '#9CA3AF' }]}
              centerLabel=""
              size={70}
              strokeWidth={10}
            />
            <div className="flex-1 text-xs space-y-0.5 overflow-hidden">
              <p className="font-extrabold text-xs text-gray-900 uppercase tracking-wider mb-0.5">Top OS Distribution</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-bold text-gray-700 text-xs">
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

          <div className="bg-white p-3 rounded-md border border-gray-200 flex flex-col justify-between shadow-xs">
            <p className="text-xs font-black text-gray-900 uppercase tracking-wider">
              Devices At Risk !
            </p>
            <div className="grid grid-cols-3 gap-1.5 mt-1 text-xs font-black">
              <div className="flex items-center gap-1 text-red-600 bg-red-50 p-1.5 rounded-md border border-red-200">
                <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0" />
                <div>
                  <span className="block text-[10px] text-gray-500 font-bold uppercase">Critical</span>
                  <span>{totalCritical}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-orange-600 bg-orange-50 p-1.5 rounded-md border border-orange-200">
                <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0" />
                <div>
                  <span className="block text-[10px] text-gray-500 font-bold uppercase">High</span>
                  <span>{totalHigh}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 p-1.5 rounded-md border border-amber-200">
                <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0" />
                <div>
                  <span className="block text-[10px] text-gray-500 font-bold uppercase">Medium</span>
                  <span>{totalMedium}</span>
                </div>
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
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search Agent / OS"
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
            disabled={loading}
            className="bg-gray-900 text-white text-xs font-bold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-black transition shadow-xs disabled:opacity-50"
          >
            <HiOutlineArrowPath className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Data Table Container */}
        <div className="bg-white rounded-md border border-gray-200 flex-1 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-xs font-bold text-gray-500 flex flex-col items-center justify-center gap-2">
                <HiOutlineArrowPath className="w-6 h-6 animate-spin text-navy-800" />
                <span>Loading Devices from Wazuh API...</span>
              </div>
            ) : paginatedDevices.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-gray-500">
                Tidak ada agent device yang ditemukan.
              </div>
            ) : (
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-navy-800 text-white text-xs font-black tracking-wider sticky top-0 z-10 select-none">
                    <th onClick={() => handleSort('agent')} className="w-[18%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                      <div className="flex items-center">
                        <span>Agent</span>
                        {renderSortIndicator('agent')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('os')} className="w-[22%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                      <div className="flex items-center">
                        <span>Operating System</span>
                        {renderSortIndicator('os')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('status')} className="w-[12%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                      <div className="flex items-center">
                        <span>Status</span>
                        {renderSortIndicator('status')}
                      </div>
                    </th>
                    <th className="w-[22%] py-2.5 px-3.5">Severity Breakdown</th>
                    <th onClick={() => handleSort('score')} className="w-[14%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                      <div className="flex items-center">
                        <span>Score</span>
                        {renderSortIndicator('score')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('lastSeen')} className="w-[12%] py-2.5 px-3.5 cursor-pointer hover:bg-navy-700 transition">
                      <div className="flex items-center">
                        <span>Last Seen</span>
                        {renderSortIndicator('lastSeen')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-xs font-semibold">
                  {paginatedDevices.map((dev) => {
                    const isSelected = isDrawerOpen && selectedDevice?.id === dev.id;
                    
                    const raw = (dev.criticalCount || 0) * 10 + (dev.highCount || 0) * 6 + (dev.mediumCount || 0) * 3;
                    const scoreVal = typeof dev.score === 'number' ? dev.score : Math.min(100, raw);
                    const cat = getRiskCategory(scoreVal);

                    const datePart = (dev as any).lastSeenDate || dev.lastSeen.split('(')[0]?.trim() || dev.lastSeen;
                    const agoPart = (dev as any).lastSeenAgo || (dev.lastSeen.includes('(') ? dev.lastSeen.split('(')[1]?.replace(')', '').trim() : '');

                    return (
                      <tr
                        key={dev.id}
                        onClick={() => handleToggleDetail(dev)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-100/80 border-l-4 border-l-navy-800' : 'hover:bg-blue-50/50'
                        }`}
                      >
                        <td className="py-2 px-3.5 text-navy-800 font-black">
                          <div className="flex items-center gap-2 truncate">
                            <HiOutlineServer className="w-4 h-4 text-navy-800 flex-shrink-0" />
                            <span className="truncate" title={dev.agent}>{dev.agent}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3.5 font-bold text-gray-900 truncate" title={dev.os}>
                          {dev.os}
                        </td>
                        <td className="py-2 px-3.5 font-bold">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black ${
                              dev.status === 'Online'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {dev.status}
                          </span>
                        </td>

                        <td className="py-2 px-3.5 font-bold">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {dev.criticalCount ? (
                              <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-300 font-black">
                                Critical: {dev.criticalCount}
                              </span>
                            ) : null}
                            <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded border border-orange-300 font-black">
                              High: {dev.highCount || 0}
                            </span>
                            <span className="bg-yellow-100 text-yellow-900 px-2 py-0.5 rounded border border-yellow-300 font-black">
                              Medium: {dev.mediumCount || 0}
                            </span>
                          </div>
                        </td>

                        <td className="py-2 px-3.5 font-bold">
                          <div className="flex items-center gap-1.5 font-black">
                            <span className="text-xs text-gray-900 font-black">{scoreVal}</span>
                            <span
                              style={{ backgroundColor: cat.color }}
                              className="text-white text-[10px] font-black px-2 py-0.5 rounded shadow-xs"
                              title={cat.meaning}
                            >
                              {cat.label}
                            </span>
                          </div>
                        </td>

                        {/* Format Last Seen Vertically (Date & Time on top, Ago below) */}
                        <td className="py-2 px-3.5">
                          <div className="flex flex-col leading-tight">
                            <span className="font-extrabold text-gray-900 text-xs truncate" title={datePart}>
                              {datePart}
                            </span>
                            {agoPart ? (
                              <span className="text-[11px] text-gray-500 font-semibold truncate">
                                {agoPart}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Footer / Pagination */}
          <div className="p-2.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs font-bold text-gray-700 flex-shrink-0">
            <span>
              Showing {filteredDevices.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(currentPage * pageSize, sortedDevices.length)} of {sortedDevices.length} devices
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded bg-white border border-gray-300 font-bold hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white transition"
              >
                Previous
              </button>
              <span className="px-2 font-black">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded bg-white border border-gray-300 font-bold hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white transition"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Drawer Panel */}
      <DeviceDetailDrawer
        device={selectedDevice}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        highlightIssue={initialHighlight}
      />

      {/* Adaptive Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filter Devices"
        sections={adaptiveFilterSections}
        initialFilters={activeFilters}
        onApply={handleApplyFilters}
      />
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs font-bold text-gray-500">Loading Devices...</div>}>
      <DevicesContent />
    </Suspense>
  );
}
