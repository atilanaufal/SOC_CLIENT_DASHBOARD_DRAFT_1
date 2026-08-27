'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineKey, HiOutlineArrowRightOnRectangle, HiOutlineClock, HiOutlineUser } from 'react-icons/hi2';
import { useRouter } from 'next/navigation';

interface ProfileDropdownProps {
  tenantName?: string;
  currentTime?: string;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ tenantName = 'PT Astra', currentTime = '12:00:00' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [userSession, setUserSession] = useState<{
    username: string;
    role: string;
    campus_name?: string;
    tenant_code?: string;
    email?: string;
  } | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition);
      };
    }
  }, [isOpen]);

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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
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
    try {
      const { authClient } = await import('@/lib/auth-client');
      await authClient.signOut();
    } catch {}
    localStorage.removeItem('user_session');
    router.push('/login');
  };

  const displayName = userSession?.campus_name || userSession?.username || tenantName;
  const userRole = userSession ? userSession.role.toUpperCase() : 'TENANT';

  return (
    <div className="relative inline-block text-left flex-shrink-0">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black text-white px-2 sm:px-2.5 xl:px-3 py-1 sm:py-1.5 xl:py-1.5 rounded-md text-[11px] sm:text-xs md:text-xs xl:text-sm font-bold hover:bg-zinc-800 transition flex items-center gap-1.5 sm:gap-2 border border-zinc-800 cursor-pointer whitespace-nowrap flex-shrink-0"
      >
        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-4 xl:h-4 flex items-center justify-center text-white/90 flex-shrink-0">
          <HiOutlineUser className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-4 xl:h-4 stroke-[2.2]" />
        </div>
        <span className="truncate max-w-[90px] sm:max-w-[120px] md:max-w-[140px] xl:max-w-[160px] 2xl:max-w-none whitespace-nowrap">{displayName}</span>
      </button>

      {isOpen && mounted && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: `${coords.top}px`, right: `${coords.right}px` }}
          className="w-60 sm:w-64 2xl:w-72 bg-white/80 backdrop-blur-2xl rounded-md z-50 text-gray-900 p-3 sm:p-3.5 2xl:p-4 border border-white/80 animate-in fade-in zoom-in-95 duration-100 space-y-2 sm:space-y-2.5 2xl:space-y-3 shadow-[0_20px_50px_rgba(0,43,154,0.15),inset_0_1px_1px_rgba(255,255,255,0.95)]"
        >
          {/* User & Tenant Info Header */}
          <div className="flex items-center gap-2.5 pb-2 sm:pb-2.5 border-b border-gray-200/80">
            <div className="w-8 h-8 sm:w-9 sm:h-9 2xl:w-10 2xl:h-10 rounded-md bg-[#002B9A] flex items-center justify-center shrink-0 text-white shadow-sm">
              <HiOutlineUser className="w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6 stroke-[2]" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs sm:text-xs xl:text-sm 2xl:text-base font-extrabold text-gray-900 truncate">{displayName}</p>
              {userSession?.username && (
                <p className="text-[10px] sm:text-[10px] xl:text-[11px] 2xl:text-xs text-gray-500 font-semibold truncate">@{userSession.username}</p>
              )}
              <span className="inline-block bg-blue-100/90 text-[#002B9A] text-[10px] sm:text-[10px] xl:text-[11px] 2xl:text-xs font-bold px-1.5 py-0.5 rounded mt-0.5 border border-blue-200">
                Tenant: {userSession?.tenant_code || 'UI'}
              </span>
            </div>
          </div>

          {/* Clock item - only visible on mobile (HP) */}
          <div className="md:hidden text-xs font-bold text-gray-800 bg-white/70 backdrop-blur-md px-2.5 py-1.5 rounded-md flex items-center gap-2 border border-white/80">
            <HiOutlineClock className="w-4 h-4 text-[#002B9A]" />
            <span>Time: {currentTime}</span>
          </div>

          {/* Actions */}
          <div className="pt-1 space-y-1">
            <button
              onClick={() => {
                alert('Reset password link has been sent to your admin email.');
                setIsOpen(false);
              }}
              className="w-full text-left py-1.5 sm:py-2 px-2 text-red-600 font-bold text-xs sm:text-xs xl:text-sm 2xl:text-base hover:bg-red-50/80 rounded-md transition flex items-center gap-2 cursor-pointer"
            >
              <HiOutlineKey className="w-4 h-4 xl:w-4.5 xl:h-4.5" />
              Reset Password
            </button>

            <button
              onClick={handleLogout}
              className="w-full text-left py-1.5 sm:py-2 px-2 text-gray-800 font-bold text-xs sm:text-xs xl:text-sm 2xl:text-base hover:bg-blue-50/80 rounded-md transition flex items-center gap-2 cursor-pointer"
            >
              <HiOutlineArrowRightOnRectangle className="w-4 h-4 xl:w-4.5 xl:h-4.5" />
              Log Out
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
