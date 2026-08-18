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

      // Redirect to dashboard on successful login
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Login submit error:', err);
      setErrorMessage('Terjadi kesalahan koneksi ke server. Silakan coba lagi.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 selection:bg-navy-800 selection:text-white">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Top Logo & Subtitle: Plain Gambar 1 Icon Only (No ASOC text) */}
        <div className="flex flex-col items-center gap-2">
          {/* Plain Gambar 1 Logo Icon */}
          <div className="w-16 h-16 relative flex items-center justify-center mb-1">
            <Image
              src="/tguard.png"
              alt="Logo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          
          <p className="text-base font-semibold text-gray-800">
            Sign in to your tenant security console
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-8 text-left space-y-5">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-semibold animate-in fade-in duration-150 flex items-start gap-2">
              <span className="font-bold">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <label htmlFor="email-input" className="block text-base font-bold text-gray-900 mb-1.5">
                Email
              </label>
              <input
                id="email-input"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter you email"
                className="w-full bg-[#f3f4f6] border border-gray-300 rounded-lg px-4 py-3 text-gray-900 font-medium placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:bg-white transition"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password-input" className="block text-base font-bold text-gray-900 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter you password"
                  className="w-full bg-[#f3f4f6] border border-gray-300 rounded-lg pl-4 pr-11 py-3 text-gray-900 font-medium placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:bg-white transition"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-800 transition cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <HiOutlineEyeSlash className="w-5 h-5" />
                  ) : (
                    <HiOutlineEye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#002B9A] hover:bg-[#002175] text-white font-bold text-lg py-3 rounded-lg transition shadow-md disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer Note */}
        <p className="text-sm font-semibold text-gray-800 pt-1">
          Don&apos;t have an account? Ask your admin to create one for you.
        </p>
      </div>
    </main>
  );
}
