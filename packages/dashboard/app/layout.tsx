import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { DashboardLayout } from '@/components/DashboardLayout';
import { BootSequence } from '@/components/BootSequence';
import { CommandPalette } from '@/components/CommandPalette';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hex',
  description: 'Local dashboard for Solidity smart contract audits',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jetbrainsMono.variable} min-h-screen bg-surface-0 text-text-primary`}>
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          <BootSequence />
          <CommandPalette />
          <DashboardLayout>{children}</DashboardLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
