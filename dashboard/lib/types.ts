/**
 * Shapes shared by server pages and client components. Type-only imports from
 * src/types are erased at build time, so nothing from zod reaches the bundle.
 */
import type {
  FactsFunction,
  Invariant,
  ProtocolModel,
  DiagramIndexEntry,
  FixReview,
} from '../../src/types/index';

export type { FactsFunction, Invariant, ProtocolModel, DiagramIndexEntry, FixReview };

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type ReviewState = 'unread' | 'read' | 'questioned' | 'cleared';

export const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
};

/** One row of the review map (src/core/review.ts FunctionReviewRow). */
export interface ReviewRow {
  id: string;
  contract: string;
  name: string;
  file: string;
  line_start: number;
  line_end: number;
  nsloc: number;
  is_entry_point: boolean;
  state: ReviewState;
  by?: string;
  updated_at?: string;
  note?: string;
  risk: number;
  risk_reasons: string[];
  ai_seen: boolean;
  cards: string[];
  diff_depth?: number;
}

export interface ReviewTotals {
  facts_source: 'solc-ast' | 'parser-fallback' | null;
  total_nsloc: number;
  cleared_nsloc: number;
  pct: number;
  counts: Record<ReviewState, number>;
}

/** A card as the board and the inspectors see it. */
export type BoardColumn = 'potential' | 'verified' | 'synced' | 'invalid' | 'duplicate';
export type SyncState = 'none' | 'unsynced' | 'synced_open' | 'synced_closed' | 'conflict';
export type IssueSource =
  | 'manual'
  | 'auditagent'
  | 'ai-audit'
  | 'conformance'
  | 'github'
  | 'prior-audit'
  | 'invariant';
export type PocStatus = 'passing' | 'failing' | 'not_started';

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  auditagent: 'AuditAgent',
  'ai-audit': 'AI audit',
  conformance: 'Conformance',
  github: 'GitHub',
  'prior-audit': 'Prior audit',
  invariant: 'Invariant',
};

export interface CardValidation {
  verdict?: 'reproduced' | 'refuted' | 'uncertain' | 'valid_no_poc';
  validated_by?: 'auditor' | 'agent';
  memo?: string;
  poc_file?: string;
  poc_status?: PocStatus;
  refuters?: number;
  auto_moved_to?: 'verified' | 'rejected';
  reverted_at?: string;
  at?: string;
}

export interface BoardIssue {
  id: string;
  title: string;
  severity: Severity;
  source: IssueSource;
  status: string;
  column: BoardColumn;
  description: string;
  recommendation: string;
  resolution?: string;
  update_from_client?: string;
  code_locations: Array<{ file: string; snippet?: string }>;
  github_issue_url?: string;
  github_issue_number?: number;
  github_state?: string;
  sync_state: SyncState;
  duplicate_of: string | null;
  match_signals?: {
    contract: boolean;
    function: boolean;
    root_cause: string;
    attack_vector: string;
  };
  reasoning?: string;
  category?: string;
  poc_status?: PocStatus;
  poc_file?: string | null;
  notes: string;
  source_ref?: string | null;
  validation?: CardValidation;
  /** Function ids the card's code points into. */
  functions: string[];
}

/** A compact card reference for inspectors on other pages. */
export interface CardRef {
  id: string;
  title: string;
  severity: Severity;
  column: BoardColumn;
}

/** Diane note pieces shown in the Review inspector. */
export interface NoteFn {
  id: string;
  sig: string;
  fn_ref?: string;
  purpose?: string;
  access?: string;
  effects?: string;
  notes: string[];
  warnings: string[];
}
export interface NoteQuestion {
  id: string;
  q: string;
  answer?: string;
}
export interface NoteLead {
  id: string;
  text: string;
  status: 'open' | 'logged' | 'dismissed';
  ref?: string;
  source?: string;
}
export interface ContractNoteView {
  /** The note target in use (may be `Vault.sol` while the contract is `Vault`). */
  target: string;
  contract: string;
  marked_done: boolean;
  purpose: string[];
  functions: NoteFn[];
  questions: NoteQuestion[];
  leads: NoteLead[];
}
