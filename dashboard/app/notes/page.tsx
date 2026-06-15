import { getOutputDirPath, readJsonFile } from '@/lib/data';
import { readNotesIndex, readNote, readContractNote, type ContractNote } from '../../../src/core/notes';
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

  // Dropdown options: contracts in scope (from stats) ∪ contracts that already
  // have notes, so the auditor can record against any contract immediately.
  const stats = readJsonFile<Stats>('stats.json');
  const scope = (stats?.per_contract ?? [])
    .filter((c) => c.type === 'contract')
    .map((c) => c.contract);
  const options = Array.from(new Set([...scope, ...index.contracts])).sort();

  // Load the structured note for each contract that has one (the index tracks
  // every contract a note doc has been written for).
  const contractNotes: ContractNote[] = index.contracts.map((name) => readContractNote(dir, name));
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
