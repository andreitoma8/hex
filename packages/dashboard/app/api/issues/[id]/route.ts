import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFile } from '@/lib/data';

interface FindingsFile {
  findings: Array<{
    id: string;
    title?: string;
    severity?: string;
    description?: string;
    recommendation?: string;
    resolution?: string;
    update_from_client?: string;
    [key: string]: unknown;
  }>;
}

interface TrackingFile {
  findings: Array<{
    id: string;
    title?: string;
    severity?: string;
    notes?: string;
    [key: string]: unknown;
  }>;
}

const EDITABLE_FIELDS = new Set([
  'title',
  'severity',
  'description',
  'recommendation',
  'resolution',
  'update_from_client',
  'notes',
]);

const SEVERITY_VALUES = new Set(['Critical', 'High', 'Medium', 'Low', 'Info']);
const RESOLUTION_VALUES = new Set([
  'Fixed',
  'Mitigated',
  'Acknowledged',
  'Not Fixed',
  'Unresolved',
]);

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = (await request.json()) as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    if (key === 'severity' && typeof value === 'string' && !SEVERITY_VALUES.has(value)) {
      return NextResponse.json({ error: `Invalid severity: ${value}` }, { status: 400 });
    }
    if (
      key === 'resolution' &&
      value != null &&
      typeof value === 'string' &&
      !RESOLUTION_VALUES.has(value)
    ) {
      return NextResponse.json({ error: `Invalid resolution: ${value}` }, { status: 400 });
    }
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  // Apply to findings.json if a matching record exists; otherwise we record the
  // edits on the tracking entry (title, severity, notes flow through; description
  // and recommendation can't be displayed yet but we still persist them so a
  // later /validate-issue or /write-finding can pick them up).
  const findings = readJsonFile<FindingsFile>('findings.json') ?? { findings: [] };
  const tracking = readJsonFile<TrackingFile>('tracking.json') ?? { findings: [] };

  let findingTouched = false;
  for (const finding of findings.findings) {
    if (finding.id !== id) continue;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'notes') continue; // notes lives on tracking, not findings
      finding[key] = value as never;
    }
    findingTouched = true;
    break;
  }

  let trackingTouched = false;
  for (const entry of tracking.findings) {
    if (entry.id !== id) continue;
    // Title and severity are mirrored on tracking so the board shows current
    // values without re-reading findings.json.
    if ('title' in updates) entry.title = updates.title as string;
    if ('severity' in updates) entry.severity = updates.severity as string;
    if ('notes' in updates) entry.notes = updates.notes as string;
    trackingTouched = true;
    break;
  }

  if (!findingTouched && !trackingTouched) {
    return NextResponse.json({ error: `Issue ${id} not found` }, { status: 404 });
  }

  if (findingTouched) writeJsonFile('findings.json', findings);
  if (trackingTouched) writeJsonFile('tracking.json', tracking);

  return NextResponse.json({ ok: true, id, updates });
}
