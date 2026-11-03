'use client';

/**
 * Keep the selection in the URL without a server round trip (Next 14.1+
 * syncs window.history with useSearchParams), so reloads and ⌘K deep links
 * land on the same item.
 */
export function replaceQuery(params: Record<string, string | null>): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '');
  if (next !== window.location.pathname + window.location.search) {
    window.history.replaceState(window.history.state, '', next);
  }
}
