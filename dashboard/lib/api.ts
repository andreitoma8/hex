'use client';

/** POST/PUT JSON and throw with the server's message on failure. */
export async function sendJson<T = unknown>(
  url: string,
  body: unknown,
  method = 'POST',
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
