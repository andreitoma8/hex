import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Sidebar } from '@/components/ui/Sidebar';
import { LAYOUT_BOOT } from '@/lib/pane-width';
import { ToastProvider } from '@/components/ui/Toast';
import { CommandPalette } from '@/components/CommandPalette';
import { AutoRefresh } from '@/components/AutoRefresh';
import pkg from '../../package.json';
import { readJsonFile } from '@/lib/data';
import { latestFixReview } from '@/lib/server/workspace';
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
  description: 'A calm review workspace for Solidity audits',
};

// The sidebar depends on .hex/ (diff mode or a fix review shows Changes), so every
// route renders at request time against the audited project's `.hex/`.
export const dynamic = 'force-dynamic';

interface ConfigFile {
  project?: { name?: string; mode?: string };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = readJsonFile<ConfigFile>('config.json');
  // Changes covers both "what moved since the base audit" (diff mode) and the
  // fix review, which follows full audits too.
  const showChanges =
    config?.project?.mode === 'diff' || latestFixReview<{ generated_at: string }>() !== null;
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} h-full bg-surface-0 font-sans text-text-primary`}
      >
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_BOOT() }} />
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          <ToastProvider>
            <AutoRefresh />
            <CommandPalette showChanges={showChanges} />
            <Sidebar
              projectName={config?.project?.name ?? null}
              version={pkg.version}
              showChanges={showChanges}
            />
            <main className="h-screen overflow-hidden bg-surface-0 transition-[margin] duration-200 ease-out md:ml-[var(--sidebar-w,220px)]">
              {children}
            </main>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
