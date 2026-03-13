import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { AnnotationsClient } from './AnnotationsClient';

interface Annotation {
  id: string;
  type: string;
  status: string;
  file: string;
  line: number;
  text: string;
}

export default function AnnotationsPage() {
  const raw = readJsonFile<{ extracted_at: string; annotations: Annotation[] }>('annotations.json');

  if (!raw) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Annotations</h2>
        <NotYetGenerated command="solaudit annotations" />
      </div>
    );
  }

  return <AnnotationsClient annotations={raw.annotations} />;
}
