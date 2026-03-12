import { fileExists } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';

export default function DiagramPage() {
  const exists = fileExists('diagram.excalidraw');

  if (!exists) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Diagram</h2>
        <NotYetGenerated command="Use the diagram skill to generate diagram.excalidraw" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Diagram</h2>

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
            d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z"
          />
        </svg>
        <h3 className="mb-2 text-lg font-medium text-gray-300">
          Diagram viewer will render diagram.excalidraw
        </h3>
        <p className="text-sm text-gray-400">
          Excalidraw integration requires client-side loading.
        </p>
        <p className="mt-4 text-xs text-gray-500">
          The diagram file has been detected and is ready for rendering once
          the Excalidraw viewer component is integrated.
        </p>
      </div>
    </div>
  );
}
