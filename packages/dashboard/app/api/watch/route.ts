import { initWatcher, onFileChange } from '@/lib/watcher';
import { getOutputDirPath } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const outputDir = getOutputDirPath();
  initWatcher(outputDir);

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection confirmation
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Subscribe to file changes from the watcher
      unsubscribe = onFileChange((file) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ file })}\n\n`),
          );
        } catch {
          // Stream closed; cleanup will happen in cancel()
        }
      });

      // Keepalive ping every 30 seconds to prevent connection timeout
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          // Stream closed; cleanup will happen in cancel()
        }
      }, 30_000);
    },
    cancel() {
      if (keepalive) clearInterval(keepalive);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
