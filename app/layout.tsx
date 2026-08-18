import type { Metadata } from 'next';
import './globals.css';
import { TimeFilterProvider } from '@/lib/time-filter-context';

export const metadata: Metadata = {
  title: 'ASOC Dashboard - SOC Security Operations Center',
  description: 'ASOC Read-Only Security Operations Monitoring Dashboard Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#f4f5f7] text-gray-900 font-sans">
        <TimeFilterProvider>
          {children}
        </TimeFilterProvider>
      </body>
    </html>
  );
}
