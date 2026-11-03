import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CommandPalette } from '@/components/CommandPalette';
import pkg from '../../package.json';
import { readJsonFile } from '@/lib/data';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hex',
  description: 'Local dashboard for Solidity smart contract audits',
};

// The sidebar depends on .hex/config.json (diff mode shows Changes), so every
// route renders at request time — including /diagram and /flows, which would
// otherwise be prerendered with whatever config existed at build time.
export const dynamic = 'force-dynamic';

function isDiffAudit(): boolean {
  return readJsonFile<{ project?: { mode?: string } }>('config.json')?.project?.mode === 'diff';
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${jetbrainsMono.variable} min-h-screen bg-surface-0 text-text-primary font-sans`}>
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          <CommandPalette />
          <DashboardLayout version={pkg.version} diffMode={isDiffAudit()}>
            {children}
          </DashboardLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
