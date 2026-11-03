'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScrollArea, SplitView, Toolbar } from '@/components/ui/SplitView';
import { ListGroupLabel, ListRow } from '@/components/ui/ListRow';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useHotkeys } from '@/lib/hotkeys';
import { replaceQuery } from '@/lib/url';

export interface ReportSections {
  executive_summary: string | null;
  audited_files: string | null;
  summary_of_findings: string | null;
  system_overview: string | null;
  findings: string | null;
  documentation_eval: string | null;
  test_suite: string | null;
}

export interface Figure {
  name: string;
  title: string;
  takeaway: string;
  v: number;
}

type Key = keyof ReportSections | 'figures';

const SECTIONS: Array<{ key: keyof ReportSections; label: string; file: string }> = [
  { key: 'executive_summary', label: 'Executive summary', file: 'executive_summary.txt' },
  { key: 'audited_files', label: 'Audited files', file: 'audited_files.txt' },
  { key: 'summary_of_findings', label: 'Summary of issues', file: 'summary_of_findings.txt' },
  { key: 'system_overview', label: 'System overview', file: 'system_overview.txt' },
  { key: 'findings', label: 'Issues', file: 'findings.txt' },
  { key: 'documentation_eval', label: 'Documentation', file: 'documentation_eval.txt' },
  { key: 'test_suite', label: 'Test suite', file: 'test_suite.txt' },
];

export function ReportClient({
  sections,
  figures,
}: {
  sections: ReportSections;
  figures: Figure[];
}) {
  const params = useSearchParams();
  const toast = useToast();
  const ready = SECTIONS.filter((s) => sections[s.key]).length;
  const order: Key[] = [
    ...SECTIONS.map((s) => s.key),
    ...(figures.length ? (['figures'] as const) : []),
  ];

  const [active, setActive] = useState<Key>(() => {
    const q = params.get('s') as Key | null;
    if (q && order.includes(q)) return q;
    return (
      SECTIONS.find((s) => sections[s.key])?.key ??
      (figures.length ? 'figures' : 'executive_summary')
    );
  });
  useEffect(() => replaceQuery({ s: active }), [active]);

  useHotkeys({
    j: () => setActive(order[Math.min(order.length - 1, order.indexOf(active) + 1)]),
    k: () => setActive(order[Math.max(0, order.indexOf(active) - 1)]),
  });

  const meta = SECTIONS.find((s) => s.key === active);
  const content = active === 'figures' ? null : sections[active];

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast({ message: `${meta?.label ?? 'Section'} copied` });
    } catch {
      toast({ message: 'Clipboard is not available here', tone: 'error' });
    }
  };

  return (
    <SplitView
      toolbar={<Toolbar title="Report" meta={`${ready} of ${SECTIONS.length} sections ready`} />}
      listWidth={240}
      list={
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ListGroupLabel>Sections</ListGroupLabel>
          {SECTIONS.map((s) => (
            <ListRow
              key={s.key}
              dense
              selected={active === s.key}
              onClick={() => setActive(s.key)}
              title={s.label}
              titleClassName={sections[s.key] ? undefined : 'text-text-tertiary'}
              trailing={sections[s.key] ? undefined : 'Not yet'}
            />
          ))}
          {figures.length > 0 && (
            <>
              <ListGroupLabel>Figures</ListGroupLabel>
              <ListRow
                dense
                selected={active === 'figures'}
                onClick={() => setActive('figures')}
                title="Diagrams in the report"
                trailing={<span className="tabular-nums">{figures.length}</span>}
              />
            </>
          )}
        </div>
      }
    >
      {active === 'figures' ? (
        <ScrollArea>
          <div className="mx-auto max-w-[900px] px-8 pb-16 pt-8">
            <h2 className="text-heading font-medium text-text-primary">Diagrams in the report</h2>
            <p className="mt-0.5 text-caption text-text-tertiary">
              PNGs in <span className="font-mono">.hex/report/figures/</span>. Choose which diagrams
              go in from Model.
            </p>
            <div className="stagger mt-6 grid gap-6 sm:grid-cols-2">
              {figures.map((f) => (
                <Link
                  key={f.name}
                  href={`/model?d=${encodeURIComponent(f.name)}`}
                  className="group block"
                >
                  <div className="overflow-hidden rounded-lg border border-border-subtle bg-white group-hover:border-border-default">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/figures/${encodeURIComponent(f.name)}?v=${f.v}`}
                      alt={f.title}
                      className="aspect-[4/3] w-full object-contain p-3"
                    />
                  </div>
                  <div className="mt-2 text-body font-medium text-text-primary">{f.title}</div>
                  {f.takeaway && (
                    <div className="text-caption text-text-tertiary">{f.takeaway}</div>
                  )}
                  <div className="font-mono text-caption text-text-tertiary">
                    figures/{f.name}.png
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </ScrollArea>
      ) : content ? (
        <>
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-5">
            <span className="flex-1 truncate font-mono text-caption text-text-tertiary">
              report/{meta?.file}
            </span>
            <Button variant="primary" size="sm" onClick={copy}>
              Copy LaTeX
            </Button>
          </div>
          <ScrollArea className="bg-[var(--code-bg)]">
            <pre className="mx-auto max-w-[900px] whitespace-pre-wrap break-words px-8 py-6 font-mono text-[12.5px] leading-6 text-text-secondary">
              {content}
            </pre>
          </ScrollArea>
        </>
      ) : (
        <EmptyState
          sentence={`${meta?.label ?? 'This section'} has not been generated yet.`}
          command="/generate-report"
        />
      )}
    </SplitView>
  );
}
