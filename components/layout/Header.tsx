'use client';

import React, { useState, useEffect } from 'react';
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
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('12:00:00');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 px-3 md:px-5 lg:px-6 py-2">
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Left Section: Mobile Hamburger + Brand Logo & Page Title */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile Menu Hamburger Trigger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-1.5 text-gray-700 hover:text-gray-900 bg-gray-100 rounded-md border border-gray-200"
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
            className="flex items-center justify-center hover:opacity-80 transition cursor-pointer p-0.5"
            title="Go to Dashboard"
          >
            <Image
              src="/tguard.png"
              alt="ASOC Logo"
              width={32}
              height={32}
              className="object-contain w-8 h-8 drop-shadow-xs"
            />
          </button>

          {/* Page Title — clicks to refresh current page */}
          <button
            onClick={handleTitleClick}
            className="text-lg md:text-xl font-black text-gray-900 border-l-2 border-gray-300 pl-3 tracking-tight hover:text-blue-700 transition cursor-pointer"
            title="Refresh this page"
          >
            {currentNav.label}
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-md border border-gray-200 ml-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    isActive
                      ? 'text-navy-800 font-extrabold bg-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Controls */}
        <div className="flex items-center gap-2">
          {/* Time Filter - Visible on Dashboard, Incidents, Vulnerabilities */}
          {isTimeFilterVisible && (
            <div className="relative">
              <button
                onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
                className="bg-gray-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-black transition shadow-xs"
              >
                <HiOutlineCalendar className="w-3.5 h-3.5 text-blue-400" />
                <span>{filterLabel}</span>
                <HiOutlineChevronDown className="w-3.5 h-3.5" />
              </button>

              {isTimeDropdownOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                  {(['Today', 'This Week', 'This Month'] as TimeFilterOption[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setTimeFilter(filter);
                        setIsTimeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-gray-100 rounded-md transition ${
                        timeFilter === filter ? 'text-navy-700 font-bold bg-navy-50' : 'text-gray-700'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                  
                  {/* Custom Option */}
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={() => {
                      setIsTimeDropdownOpen(false);
                      setIsCustomModalOpen(true);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-bold hover:bg-gray-100 rounded-md transition flex items-center gap-1.5 ${
                      timeFilter === 'Custom' ? 'text-navy-700 bg-navy-50 font-extrabold' : 'text-gray-800'
                    }`}
                  >
                    <HiOutlineCalendar className="w-3.5 h-3.5 text-navy-800" />
                    <span>Custom...</span>
                  </button>
                </div>
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
            className="bg-navy-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-navy-800 transition border border-navy-700 shadow-xs"
            title="Open Database & Caching Debugger Modal"
          >
            <HiOutlineServer className="w-3.5 h-3.5 text-blue-400" />
            <span>Database Status</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>

          {/* Clock */}
          <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-gray-800 bg-gray-100 px-2.5 py-1.5 rounded-md border border-gray-200">
            <HiOutlineClock className="w-3.5 h-3.5 text-navy-800" />
            <span>{currentTime}</span>
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
                    ? 'bg-navy-800 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
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
