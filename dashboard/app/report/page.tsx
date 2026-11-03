import { readMarkdownFile } from '@/lib/data';
import { figureMtime, listFigures, readIndex } from '@/lib/server/diagrams';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toolbar } from '@/components/ui/SplitView';
import { ReportClient, type Figure, type ReportSections } from './ReportClient';

export const dynamic = 'force-dynamic';

/** Report answers: is each section ready to paste into the template? */
export default function ReportPage() {
  const sections: ReportSections = {
    executive_summary: readMarkdownFile('report/executive_summary.txt'),
    audited_files: readMarkdownFile('report/audited_files.txt'),
    summary_of_findings: readMarkdownFile('report/summary_of_findings.txt'),
    system_overview: readMarkdownFile('report/system_overview.txt'),
    findings: readMarkdownFile('report/findings.txt'),
    documentation_eval: readMarkdownFile('report/documentation_eval.txt'),
    test_suite: readMarkdownFile('report/test_suite.txt'),
  };

  const index = readIndex();
  const onDisk = new Set(listFigures());
  const figures: Figure[] = [];
  for (const e of index) {
    if (!e.in_report || !onDisk.has(e.name)) continue;
    figures.push({ name: e.name, title: e.title, takeaway: e.takeaway, v: figureMtime(e.name) });
    onDisk.delete(e.name);
  }
  // PNGs dropped in by hand (or by the report skill) still belong to the report.
  for (const name of Array.from(onDisk))
    figures.push({ name, title: name, takeaway: '', v: figureMtime(name) });

  if (!Object.values(sections).some(Boolean) && figures.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Toolbar title="Report" />
        <EmptyState
          sentence="The report sections appear here once they are generated."
          command="/generate-report"
        />
      </div>
    );
  }

  return <ReportClient sections={sections} figures={figures} />;
}
