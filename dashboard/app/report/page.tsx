import { readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ReportClient, type ReportSections } from './ReportClient';

// Read .hex/report/ at request time, not at build time.
export const dynamic = 'force-dynamic';

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

  const anyPresent = Object.values(sections).some(Boolean);
  if (!anyPresent) {
    return (
      <div>
        <header className="mb-6">
          <h1 className="text-title font-semibold text-text-primary">Report</h1>
          <p className="mt-1 text-body text-text-secondary">
            LaTeX report sections, ready to paste into the Nethermind Overleaf template.
          </p>
        </header>
        <NotYetGenerated command="/generate-report" />
      </div>
    );
  }

  return <ReportClient sections={sections} />;
}
