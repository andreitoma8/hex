import type { Metadata } from 'next';
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
    <html lang="en" className="dark">
      <body className="bg-gray-900 text-gray-100 min-h-screen">
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
