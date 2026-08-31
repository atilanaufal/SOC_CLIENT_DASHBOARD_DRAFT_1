import React from 'react';
import { Header } from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-transparent">
      <Header />
<<<<<<< Updated upstream
      <main className="flex-1 w-full px-2.5 sm:px-3.5 md:px-5 lg:px-6 py-2.5 sm:py-3 pb-8 md:pb-4 overflow-y-auto">
=======
      <main className="flex-1 w-full px-2.5 sm:px-3.5 md:px-5 lg:px-6 pt-[76px] sm:pt-[80px] md:pt-[84px] pb-8 md:pb-4 overflow-y-auto">
>>>>>>> Stashed changes
        {children}
      </main>
    </div>
  );
}
