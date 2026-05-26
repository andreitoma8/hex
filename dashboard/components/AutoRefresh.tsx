'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/watch');

    eventSource.onmessage = () => {
      // Debounce: clear any pending refresh and schedule a new one
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, 500);
    };

    eventSource.onerror = () => {
      // The browser will automatically attempt to reconnect for SSE.
      // No action needed here beyond letting the default reconnect behavior work.
    };

    return () => {
      eventSource.close();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [router]);

  return null;
}
