import { getOutputDirPath, readJsonFile } from '@/lib/data';
import { readNotesIndex, readNote } from '../../../src/core/notes';
import { NotesClient } from './NotesClient';

// Read .hex/notes at request time (see app/stats/page.tsx for the rationale).
export const dynamic = 'force-dynamic';

interface PerContract {
  contract: string;
  type: string;
  file: string;
}
interface Stats {
  per_contract?: PerContract[];
}

export default function NotesPage() {
  const dir = getOutputDirPath();
  const index = readNotesIndex(dir);
  const general = readNote(dir, 'general');
  const contractNotes = index.contracts.map((name) => ({ name, body: readNote(dir, name) }));

  // Dropdown options: contracts in scope (from stats) ∪ contracts that already
  // have notes, so the auditor can record against any contract immediately.
  const stats = readJsonFile<Stats>('stats.json');
  const scope = (stats?.per_contract ?? [])
    .filter((c) => c.type === 'contract')
    .map((c) => c.contract);
  const options = Array.from(new Set([...scope, ...index.contracts])).sort();
  const unprocessed = index.sessions.filter((s) => !s.processed).length;

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Notes</h2>
      <NotesClient
        general={general}
        contractNotes={contractNotes}
        contractOptions={options}
        activeContract={index.active_contract}
        unprocessedCount={unprocessed}
      />
    </div>
  );
}
