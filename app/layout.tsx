import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TimeFilterProvider } from '@/lib/time-filter-context';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'InfoGuard - SOC Security Operations Center',
  description: 'InfoGuard Read-Only Security Operations Monitoring Dashboard Platform',
  icons: {
    icon: '/infoguard.png',
    shortcut: '/infoguard.png',
    apple: '/infoguard.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased text-gray-900 min-h-screen`}>
        <TimeFilterProvider>
          {children}
        </TimeFilterProvider>
      </body>
    </html>
  );
}
