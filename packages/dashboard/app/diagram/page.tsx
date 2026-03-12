import { fileExists } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ExcalidrawViewer } from '@/components/ExcalidrawViewer';

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
      <ExcalidrawViewer filename="diagram.excalidraw" />
    </div>
  );
}
