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

export const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { timeFilter, customRange, setTimeFilter, filterLabel } = useTimeFilter();
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [timeCoords, setTimeCoords] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  // Realtime clock (Format: HH:MM:SS WIB)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);


  // Close dropdowns on outside click

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
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/devices', label: 'Devices' },
    { href: '/incidents', label: 'Incidents' },
    { href: '/vulnerabilities', label: 'Vulnerabilities' },
    { href: '/reports', label: 'Reports' },
  ];

  const currentNav =
    navItems.find((item) => pathname.startsWith(item.href)) || navItems[0];

  const handleTimeSelect = (val: TimeFilterOption) => {
    if (val === 'Custom') {
      setIsCustomModalOpen(true);
    } else {
      setTimeFilter(val);
    }
    setIsTimeDropdownOpen(false);
  };

  const handleIconClick = () => {
    router.push('/dashboard');
  };

  const handleTitleClick = () => {
    router.refresh();
  };

  return (

    <header className="fixed top-0 left-0 right-0 z-30 bg-white/70 backdrop-blur-xl border-b border-white/70 shadow-[0_4px_20px_0_rgba(31,38,135,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.9)] px-2.5 sm:px-3 md:px-4 xl:px-5 2xl:px-6 py-1.5 sm:py-2 md:py-2 xl:py-2.5 flex-shrink-0 transition-all duration-200">
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 md:gap-3 xl:gap-4">
        {/* Left: Hamburger (Mobile) + Logo + Title (Mobile only) + Desktop Navigation Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 xl:gap-3 min-w-0">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-1 sm:p-1.5 rounded-lg text-gray-700 hover:bg-white/80 hover:text-gray-900 border border-gray-200/80 transition cursor-pointer"
            aria-label="Toggle navigation menu"

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

          {/* Page Title — only on small screens (< lg) */}
          <button
            onClick={handleTitleClick}

            className="lg:hidden text-sm sm:text-base font-black text-gray-900 border-l-2 border-gray-300 pl-2 sm:pl-2.5 tracking-tight hover:text-[#0066B1] transition cursor-pointer whitespace-nowrap flex-shrink-0"

            title="Refresh this page"
          >
            {currentNav.label}
          </button>


          {/* Desktop Navigation Bar — positioned where the title used to be */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 2xl:gap-2 bg-white/60 backdrop-blur-md p-1 xl:p-1.5 rounded-xl border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] ml-1 xl:ml-2">

            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}

                  className={`px-2.5 xl:px-3.5 2xl:px-4 py-1 sm:py-1 xl:py-1.5 rounded-lg text-xs xl:text-sm 2xl:text-base font-extrabold transition-all duration-150 whitespace-nowrap ${
                    isActive
                      ? 'bg-[#002B9A]/95 text-white shadow-[0_4px_12px_rgba(0,43,154,0.35)]'
                      : 'text-gray-700 hover:text-[#002B9A] hover:bg-white/80'

                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>


        {/* Right: Controls (Time Filter + Clock + Tenant Logo) */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 xl:gap-2.5 flex-shrink-0">
          {/* Time Filter Pill (Always present on all pages) */}
          <div className="relative inline-block text-left flex-shrink-0">
            <button
              ref={timeButtonRef}
              onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
              className="bg-white/80 backdrop-blur-md hover:bg-white text-gray-800 text-[11px] sm:text-xs md:text-xs xl:text-sm font-black px-2 sm:px-2.5 xl:px-3 py-1 sm:py-1.5 xl:py-1.5 rounded-md flex items-center gap-1 sm:gap-1.5 border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.03)] transition cursor-pointer whitespace-nowrap flex-shrink-0"
            >
              <span className="whitespace-nowrap">{filterLabel}</span>
              <HiOutlineChevronDown className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-[#002B9A] stroke-[2.5] flex-shrink-0" />
            </button>

            {isTimeDropdownOpen && mounted && timeCoords && createPortal(
              <div
                ref={timeDropdownRef}
                style={{ position: 'fixed', top: `${timeCoords.top}px`, right: `${timeCoords.right}px` }}
                className="w-36 sm:w-40 xl:w-44 bg-white/90 backdrop-blur-2xl rounded-lg z-50 text-gray-900 p-1.5 border border-white/80 animate-in fade-in zoom-in-95 duration-100 shadow-[0_16px_36px_rgba(0,43,154,0.15),inset_0_1px_1px_rgba(255,255,255,0.95)]"
              >
                {(['Today', 'This Week', 'This Month'] as TimeFilterOption[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleTimeSelect(opt)}
                    className={`w-full text-left px-3 py-1.5 text-xs xl:text-sm font-bold rounded-md transition flex items-center justify-between cursor-pointer whitespace-nowrap ${
                      timeFilter === opt ? 'text-[#002B9A] bg-blue-50/90 font-black' : 'text-gray-800 hover:bg-blue-50/80'
                    }`}
                  >
                    <span>{opt}</span>
                  </button>
                ))}

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


          {/* Custom Date Range Modal */}
          <CustomDateModal
            isOpen={isCustomModalOpen}
            onClose={() => setIsCustomModalOpen(false)}
            initialRange={customRange}
            onApply={(range) => setTimeFilter('Custom', range)}
          />



          {/* Clock */}
          <div className="hidden md:flex items-center gap-1.5 text-xs xl:text-sm font-bold text-gray-800 bg-white/70 backdrop-blur-md px-2.5 xl:px-3 py-1 sm:py-1.5 xl:py-1.5 rounded-md border border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] whitespace-nowrap flex-shrink-0">
            <HiOutlineClock className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-[#002B9A] flex-shrink-0" />
            <span className="whitespace-nowrap font-mono">{currentTime}</span>
          </div>

          {/* Tenant Logo Dropdown */}
          <ProfileDropdown currentTime={currentTime} />
        </div>
      </div>

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
                className={`px-3 py-2 rounded-lg text-sm font-extrabold transition ${
                  isActive

                    ? 'bg-[#002B9A] text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'

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
