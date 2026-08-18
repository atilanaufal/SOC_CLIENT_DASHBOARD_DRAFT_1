import React from 'react';
import { Header } from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen bg-[#f4f5f7] flex flex-col font-sans overflow-hidden">
      <Header />
      <main className="flex-1 w-full px-3 md:px-4 lg:px-5 py-2 min-h-0 overflow-y-auto md:overflow-hidden">
        {children}
      </main>
    </div>
  );
}
