import { fileExists } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ExcalidrawViewer } from '@/components/ExcalidrawViewer';

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
      <ExcalidrawViewer filename="flows.excalidraw" />
    </div>
  );
}
