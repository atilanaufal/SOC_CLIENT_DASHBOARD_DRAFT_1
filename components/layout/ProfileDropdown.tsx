'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HiOutlineKey, HiOutlineArrowRightOnRectangle, HiOutlineClock, HiOutlineUser } from 'react-icons/hi2';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface ProfileDropdownProps {
  tenantName?: string;
  currentTime?: string;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ tenantName = 'PT Astra', currentTime = '12:00:00' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [userSession, setUserSession] = useState<{ username: string; role: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Read session info from /api/auth/me or localStorage
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          setUserSession(data.user);
        } else {
          const stored = localStorage.getItem('user_session');
          if (stored) {
            try {
              setUserSession(JSON.parse(stored));
            } catch {}
          }
        }
      })
      .catch(() => {
        const stored = localStorage.getItem('user_session');
        if (stored) {
          try {
            setUserSession(JSON.parse(stored));
          } catch {}
        }
      });

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('user_session');
    router.push('/login');
  };

  const displayName = userSession ? userSession.username : tenantName;
  const userRole = userSession ? userSession.role.toUpperCase() : 'TENANT';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-navy-900 text-white px-2.5 py-1.5 rounded-md text-xs font-bold hover:bg-navy-800 transition flex items-center gap-2 border border-navy-700 shadow-xs cursor-pointer"
      >
        <div className="w-4 h-4 relative flex items-center justify-center">
          <Image
            src="/tguard.png"
            alt="Tenant Logo"
            width={16}
            height={16}
            className="object-contain w-4 h-4"
          />
        </div>
        <span>{displayName}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-60 bg-white rounded-md shadow-2xl z-50 text-gray-900 p-3 border border-gray-200 animate-in fade-in zoom-in-95 duration-100 space-y-2">
          {/* User & Tenant Info Header */}
          <div className="flex items-center gap-2.5 pb-2 border-b border-gray-200">
            <div className="w-8 h-8 rounded-md bg-navy-900 p-1 flex items-center justify-center shrink-0">
              <Image
                src="/tguard.png"
                alt="Profile Icon"
                width={24}
                height={24}
                className="object-contain w-6 h-6"
              />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-extrabold text-gray-900 truncate">{displayName}</p>
              <span className="inline-block bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5">
                Role: {userRole}
              </span>
            </div>
          </div>

          {/* Clock item */}
          <div className="text-xs font-bold text-gray-800 bg-gray-100 px-2.5 py-1.5 rounded-md flex items-center gap-2 border border-gray-200">
            <HiOutlineClock className="w-4 h-4 text-navy-800" />
            <span>Time: {currentTime}</span>
          </div>

          {/* Actions */}
          <div className="pt-1 space-y-1">
            <button
              onClick={() => {
                alert('Reset password link has been sent to your admin email.');
                setIsOpen(false);
              }}
              className="w-full text-left py-1.5 px-2 text-red-600 font-bold text-xs hover:bg-red-50 rounded-md transition flex items-center gap-2 cursor-pointer"
            >
              <HiOutlineKey className="w-4 h-4" />
              Reset Password
            </button>

            <button
              onClick={handleLogout}
              className="w-full text-left py-1.5 px-2 text-gray-800 font-bold text-xs hover:bg-gray-100 rounded-md transition flex items-center gap-2 cursor-pointer"
            >
              <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
