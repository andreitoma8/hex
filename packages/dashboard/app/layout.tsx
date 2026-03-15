import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { DashboardLayout } from '@/components/DashboardLayout';
import './globals.css';

export const metadata: Metadata = {
  title: 'SolAudit Dashboard',
  description: 'Local dashboard for Solidity smart contract audits',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-surface-0 text-text-primary">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <DashboardLayout>{children}</DashboardLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
