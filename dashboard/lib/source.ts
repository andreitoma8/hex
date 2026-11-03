'use client';

const cache = new Map<string, { at: number; code: Promise<string> }>();
const TTL = 15_000;

/** Whole-file source, cached briefly so moving between functions in one file is instant. */
export function fetchSource(file: string): Promise<string> {
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < TTL) return hit.code;
  const code = fetch(`/api/code?file=${encodeURIComponent(file)}`)
    .then(async (r) => {
      const data = (await r.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!r.ok || typeof data.code !== 'string')
        throw new Error(data.error ?? 'Could not load the file');
      return data.code;
    })
    .catch((err) => {
      cache.delete(file);
      throw err;
    });
  cache.set(file, { at: Date.now(), code });
  return code;
}

/** Drop the cached copy of `file` (Hex just changed it on disk). */
export function invalidateSource(file: string): void {
  cache.delete(file);
}
