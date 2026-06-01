import { readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { OverleafClient, type OverleafSections } from './OverleafClient';

// Read .hex/overleaf/ at request time, not at build time.
export const dynamic = 'force-dynamic';

export default function OverleafPage() {
  const sections: OverleafSections = {
    executive_summary: readMarkdownFile('overleaf/executive_summary.txt'),
    audited_files: readMarkdownFile('overleaf/audited_files.txt'),
    summary_of_findings: readMarkdownFile('overleaf/summary_of_findings.txt'),
    findings: readMarkdownFile('overleaf/findings.txt'),
  };

  const anyPresent = Object.values(sections).some(Boolean);
  if (!anyPresent) {
    return (
      <div>
        <header className="mb-6">
          <h1 className="text-title font-semibold text-text-primary">Overleaf</h1>
          <p className="mt-1 text-body text-text-secondary">
            LaTeX report sections, ready to paste into the Nethermind Overleaf template.
          </p>
        </header>
        <NotYetGenerated command="/generate-overleaf" />
      </div>
    );
  }

  return <OverleafClient sections={sections} />;
}
