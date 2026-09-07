import React from 'react';
import { Header } from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-transparent w-full overflow-x-hidden">
      <Header />

      <main className="flex-1 w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-5 lg:px-6 pt-[76px] sm:pt-[80px] md:pt-[84px] pb-10 sm:pb-8 md:pb-6 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
