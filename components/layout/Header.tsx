'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  HiOutlineShieldExclamation,
  HiOutlineChevronDown,
  HiOutlineBars3,
  HiOutlineXMark,
  HiOutlineClock,
  HiOutlineCalendar,
} from 'react-icons/hi2';
import { ProfileDropdown } from './ProfileDropdown';
import { useTimeFilter, TimeFilterOption } from '@/lib/time-filter-context';
import { CustomDateModal } from '../modals/CustomDateModal';

import { DatabaseStatusModal } from '../modals/DatabaseStatusModal';
import { HiOutlineServer } from 'react-icons/hi2';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { timeFilter, customRange, setTimeFilter, filterLabel } = useTimeFilter();
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [timeCoords, setTimeCoords] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('12:00:00');
  const timeButtonRef = useRef<HTMLButtonElement>(null);
  const timeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateTimePosition = () => {
    if (timeButtonRef.current) {
      const rect = timeButtonRef.current.getBoundingClientRect();
      setTimeCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  };

  useEffect(() => {
    if (isTimeDropdownOpen) {
      updateTimePosition();
      window.addEventListener('resize', updateTimePosition);
      window.addEventListener('scroll', updateTimePosition);
      return () => {
        window.removeEventListener('resize', updateTimePosition);
        window.removeEventListener('scroll', updateTimePosition);
      };
    }
  }, [isTimeDropdownOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        timeDropdownRef.current &&
        !timeDropdownRef.current.contains(event.target as Node) &&
        timeButtonRef.current &&
        !timeButtonRef.current.contains(event.target as Node)
      ) {
        setIsTimeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Incidents', href: '/incidents' },
    { label: 'Devices', href: '/devices' },
    { label: 'Vulnerabilities', href: '/vulnerabilities' },
    { label: 'Reports', href: '/reports' },
  ];

  const currentNav = navItems.find((item) => pathname.startsWith(item.href)) || navItems[0];
  const isTimeFilterVisible = true;

  const handleIconClick = () => {
    router.push('/dashboard');
  };

  const handleTitleClick = () => {
    window.location.reload();
  };

  return (
    <header className="bg-white/70 backdrop-blur-xl border-b border-white/60 shadow-[0_4px_24px_-4px_rgba(0,43,154,0.03),inset_0_1px_1px_rgba(255,255,255,0.9)] sticky top-0 z-40 px-2.5 sm:px-3.5 md:px-4 lg:px-5 2xl:px-7 py-2 sm:py-2.5">
      <div className="flex items-center justify-between gap-2 sm:gap-3 2xl:gap-4 w-full">
        {/* Left Section: Mobile Hamburger + Brand Logo & Page Title */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 lg:gap-3 flex-shrink-0">
          {/* Mobile Menu Hamburger Trigger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-1.5 text-gray-700 hover:text-gray-900 bg-white/70 backdrop-blur-md rounded-md border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] cursor-pointer flex-shrink-0"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <HiOutlineXMark className="w-5 h-5" />
            ) : (
              <HiOutlineBars3 className="w-5 h-5" />
            )}
          </button>

          {/* Plain Logo Icon — clicks to /dashboard */}
          <button
            onClick={handleIconClick}
            className="flex items-center justify-center hover:opacity-80 transition cursor-pointer p-0.5 flex-shrink-0"
            title="Go to Dashboard"
          >
            <Image
              src="/infoguard.png"
              alt="InfoGuard Logo"
              width={36}
              height={36}
              className="object-contain w-7 h-7 sm:w-8 sm:h-8 md:w-8 md:h-8 xl:w-9 xl:h-9"
            />
          </button>

          {/* Page Title — clicks to refresh current page */}
          <button
            onClick={handleTitleClick}
            className="text-sm sm:text-base md:text-lg xl:text-xl 2xl:text-2xl font-black text-gray-900 border-l-2 border-gray-300 pl-2 sm:pl-2.5 2xl:pl-3 tracking-tight hover:text-[#0066B1] transition cursor-pointer whitespace-nowrap flex-shrink-0"
            title="Refresh this page"
          >
            {currentNav.label}
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 bg-slate-100/60 backdrop-blur-md p-1 rounded-lg border border-white/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] ml-1 xl:ml-2 flex-shrink-0">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 lg:px-3 xl:px-3.5 2xl:px-4 py-1 xl:py-1.5 text-xs xl:text-sm font-bold rounded-md transition whitespace-nowrap ${
                    isActive
                      ? 'text-[#002B9A] font-extrabold bg-white/90 backdrop-blur-sm border border-slate-200/80 shadow-[0_2px_8px_rgba(0,43,154,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)]'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 xl:gap-2.5 flex-shrink-0">
          {/* Time Filter - Visible on Dashboard, Incidents, Vulnerabilities */}
          {isTimeFilterVisible && (
            <div className="relative flex-shrink-0">
              <button
                ref={timeButtonRef}
                onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
                className="bg-black/90 backdrop-blur-md text-white text-[11px] sm:text-xs md:text-xs xl:text-sm font-bold px-2 sm:px-2.5 xl:px-3 py-1 sm:py-1.5 xl:py-1.5 rounded-md flex items-center gap-1 sm:gap-1.5 hover:bg-black transition border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                <HiOutlineCalendar className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-blue-400 flex-shrink-0" />
                <span className="whitespace-nowrap">{filterLabel}</span>
                <HiOutlineChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              </button>

              {isTimeDropdownOpen && mounted && timeCoords && createPortal(
                <div
                  ref={timeDropdownRef}
                  style={{ position: 'fixed', top: `${timeCoords.top}px`, right: `${timeCoords.right}px` }}
                  className="w-44 2xl:w-52 bg-white/80 backdrop-blur-2xl rounded-md border border-white/80 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 shadow-[0_20px_50px_rgba(0,43,154,0.15),inset_0_1px_1px_rgba(255,255,255,0.95)] space-y-0.5"
                >
                  {(['Today', 'This Week', 'This Month'] as TimeFilterOption[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setTimeFilter(filter);
                        setIsTimeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs xl:text-sm font-bold rounded-md transition cursor-pointer whitespace-nowrap ${
                        timeFilter === filter ? 'text-[#002B9A] bg-blue-50/90 font-black' : 'text-gray-700 hover:bg-blue-50/80'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                  
                  {/* Custom Option */}
                  <div className="border-t border-gray-200/80 my-1"></div>
                  <button
                    onClick={() => {
                      setIsTimeDropdownOpen(false);
                      setIsCustomModalOpen(true);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs xl:text-sm font-bold rounded-md transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      timeFilter === 'Custom' ? 'text-[#002B9A] bg-blue-50/90 font-black' : 'text-gray-800 hover:bg-blue-50/80'
                    }`}
                  >
                    <HiOutlineCalendar className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-[#002B9A] flex-shrink-0" />
                    <span>Custom...</span>
                  </button>
                </div>,
                document.body
              )}
            </div>
          )}

          {/* Custom Date Range Modal */}
          <CustomDateModal
            isOpen={isCustomModalOpen}
            onClose={() => setIsCustomModalOpen(false)}
            initialRange={customRange}
            onApply={(range) => setTimeFilter('Custom', range)}
          />

          {/* Database Status Debugging Button */}
          <button
            onClick={() => setIsDbModalOpen(true)}
            className="bg-[#002B9A]/95 backdrop-blur-md text-white text-[11px] sm:text-xs md:text-xs xl:text-sm font-bold px-2 sm:px-2.5 xl:px-3 py-1 sm:py-1.5 xl:py-1.5 rounded-md flex items-center gap-1 sm:gap-1.5 hover:bg-[#002175] transition border border-white/20 shadow-[0_2px_10px_rgba(0,43,154,0.25)] cursor-pointer whitespace-nowrap flex-shrink-0"
            title="Open Database & Caching Debugger Modal"
          >
            <HiOutlineServer className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-blue-300 flex-shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Database Status</span>
            <span className="sm:hidden text-[10px] whitespace-nowrap">DB Status</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
          </button>

          {/* Clock */}
          <div className="hidden md:flex items-center gap-1.5 text-xs xl:text-sm font-bold text-gray-800 bg-white/70 backdrop-blur-md px-2.5 xl:px-3 py-1 sm:py-1.5 xl:py-1.5 rounded-md border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] whitespace-nowrap flex-shrink-0">
            <HiOutlineClock className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-[#002B9A] flex-shrink-0" />
            <span className="whitespace-nowrap font-mono">{currentTime}</span>
          </div>

          {/* Tenant Logo Dropdown */}
          <ProfileDropdown tenantName="PT Astra" currentTime={currentTime} />
        </div>
      </div>

      {/* Database Status Debugger Modal */}
      <DatabaseStatusModal isOpen={isDbModalOpen} onClose={() => setIsDbModalOpen(false)} />

      {/* Mobile Nav Overlay Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden mt-2 pt-2 border-t border-gray-200 flex flex-col gap-1 animate-in slide-in-from-top-2 duration-150">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2 text-sm font-bold rounded-md transition ${
                  isActive
                    ? 'bg-[#002B9A] text-white'
                    : 'text-gray-700 hover:bg-white/80'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
};
