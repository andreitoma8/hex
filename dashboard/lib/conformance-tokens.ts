/**
 * Shared conformance-status color tokens, used by the `/conformance` page summary
 * pills and the table itself. Keeping them in one module prevents the two
 * surfaces from drifting visually.
 *
 * Status keys mirror the values used in `spec-conformance.json` items.
 */

export const CONFORMANCE_STATUSES = [
  'DEVIATES',
  'PARTIAL',
  'UNVERIFIABLE',
  'UNDOCUMENTED',
  'CONFORMS',
] as const;

export type ConformanceStatus = (typeof CONFORMANCE_STATUSES)[number];

export const CONFORMANCE_STATUS_DOT: Record<ConformanceStatus, string> = {
  DEVIATES: 'bg-[var(--critical)]',
  PARTIAL: 'bg-[var(--medium)]',
  UNVERIFIABLE: 'bg-accent',
  UNDOCUMENTED: 'bg-[var(--neutral)]',
  CONFORMS: 'bg-[var(--success)]',
};

export const CONFORMANCE_STATUS_TEXT: Record<ConformanceStatus, string> = {
  DEVIATES: 'text-[var(--critical)]',
  PARTIAL: 'text-[var(--medium)]',
  UNVERIFIABLE: 'text-accent',
  UNDOCUMENTED: 'text-text-secondary',
  CONFORMS: 'text-[var(--success)]',
};

export const CONFORMANCE_STATUS_BADGE: Record<ConformanceStatus, string> = {
  DEVIATES: 'bg-[var(--critical)]/18 text-[var(--critical)]',
  PARTIAL: 'bg-[var(--medium)]/18 text-[var(--medium)]',
  UNVERIFIABLE: 'bg-accent/18 text-accent',
  UNDOCUMENTED: 'bg-[var(--neutral)]/18 text-[var(--neutral)]',
  CONFORMS: 'bg-[var(--success)]/18 text-[var(--success)]',
};

export const CONFORMANCE_STATUS_ROW_BG: Record<ConformanceStatus, string> = {
  DEVIATES: 'bg-[var(--critical)]/5',
  PARTIAL: 'bg-[var(--medium)]/5',
  UNVERIFIABLE: 'bg-accent/5',
  UNDOCUMENTED: 'bg-surface-1',
  CONFORMS: 'bg-[var(--success)]/5',
};
