'use client';

/**
 * A timestamp in the viewer's locale and time zone. The server renders it too,
 * in its own zone, so the text can legitimately differ on hydration: the
 * browser's value wins without a hydration error.
 */
export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {new Date(iso).toLocaleString()}
    </time>
  );
}
