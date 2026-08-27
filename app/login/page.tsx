'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Silakan isi Email/Username dan Password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: email,
          password: password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Login gagal. Periksa username dan password Anda.');
        setIsLoading(false);
        return;
      }

      // Save username in localStorage for frontend persistence
      if (data.user) {
        localStorage.setItem('user_session', JSON.stringify(data.user));
      }

      // Redirect to target destination or dashboard on successful login
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const fromPath = params?.get('from') || '/dashboard';
      router.push(fromPath);
    } catch (err: any) {
      console.error('Login submit error:', err);
      setErrorMessage('Terjadi kesalahan koneksi ke server. Silakan coba lagi.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-[#002B9A] selection:text-white">
      <div className="w-full max-w-md space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Top Logo & Subtitle */}
        <div className="flex flex-col items-center gap-2.5">
          {/* Logo Container with Glass Accent */}
          <div className="w-14 h-14 rounded-lg bg-white/80 backdrop-blur-xl border border-white/80 flex items-center justify-center p-2">
            <Image
              src="/infoguard.png"
              alt="InfoGuard Logo"
              width={48}
              height={48}
              className="object-contain"
              priority
            />
          </div>
          
          <div>
            <h1 className="text-xl font-black text-[#002B9A] tracking-tight">
              Tenant Security Console
            </h1>
            <p className="text-xs font-bold text-gray-600 mt-1">
              Sign in to manage and monitor your security posture
            </p>
          </div>
        </div>

        {/* Login Frosted Glass Card - 80% Opacity & rounded-lg */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-lg border border-white/80 p-6 sm:p-7 text-left space-y-4">
          {errorMessage && (
            <div className="bg-red-50/80 backdrop-blur-md border border-red-200/80 text-red-700 px-3.5 py-2.5 rounded-md text-xs font-bold animate-in fade-in duration-150 flex items-start gap-2">
              <span className="font-bold flex-shrink-0">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-3.5">
            <div>
              <label htmlFor="email-input" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                Username / Email
              </label>
              <input
                id="email-input"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your username or email"
                className="w-full bg-white/60 hover:bg-white/80 focus:bg-white/95 backdrop-blur-md border border-white/80 rounded-md px-3.5 py-2.5 text-xs text-gray-900 font-semibold placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#002B9A] focus:border-[#002B9A] transition"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password-input" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-white/60 hover:bg-white/80 focus:bg-white/95 backdrop-blur-md border border-white/80 rounded-md pl-3.5 pr-10 py-2.5 text-xs text-gray-900 font-semibold placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#002B9A] focus:border-[#002B9A] transition"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 transition cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <HiOutlineEyeSlash className="w-4 h-4" />
                  ) : (
                    <HiOutlineEye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#002B9A] hover:bg-[#002175] active:bg-[#001854] text-white font-extrabold text-xs py-2.5 rounded-md transition disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer border border-[#002175] mt-2"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer Note */}
        <p className="text-xs font-bold text-gray-500">
          Don&apos;t have an account? Ask your administrator for access.
        </p>
      </div>
    </main>
  );
}
