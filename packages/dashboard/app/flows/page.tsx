import { fileExists } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';

export default function FlowsPage() {
  const exists = fileExists('flows.excalidraw');

  if (!exists) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Flows</h2>
        <NotYetGenerated command="Use the flows skill to generate flows.excalidraw" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Flows</h2>

      <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
        <svg
          className="mx-auto mb-4 h-16 w-16 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
        </svg>
        <h3 className="mb-2 text-lg font-medium text-gray-300">
          Flow chart viewer will render flows.excalidraw
        </h3>
        <p className="text-sm text-gray-400">
          Excalidraw integration requires client-side loading.
        </p>
        <p className="mt-4 text-xs text-gray-500">
          The flows file has been detected and is ready for rendering once
          the Excalidraw viewer component is integrated.
        </p>
      </div>
    </div>
  );
}
