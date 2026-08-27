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
      <body className="antialiased text-gray-900 font-sans min-h-screen">
        <TimeFilterProvider>
          {children}
        </TimeFilterProvider>
      </body>
    </html>
  );
}
