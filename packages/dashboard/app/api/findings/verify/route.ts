import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFile, readNestedJsonFile } from '@/lib/data';

interface TrackingEntry {
  id: string;
  title: string;
  severity: string;
  source: string;
  status: string;
  poc_status: string;
  poc_file: string | null;
  duplicates: string[];
  notes: string;
}

interface TrackingData {
  findings?: TrackingEntry[];
  issues?: TrackingEntry[];
}

interface AiResultFinding {
  id: string;
  tool: string;
  title: string;
  severity: string;
  description: string;
  affected_code: { file: string; snippet?: string }[];
  confidence?: string;
  category?: string;
}

interface AiResultFile {
  tool: string;
  findings: AiResultFinding[];
}

interface Finding {
  id: string;
  title: string;
  severity: string;
  category: string;
  description: string;
  root_cause: { locations: { file: string; snippet?: string }[] };
  poc: { status: string; file: string | null; validation_memo: string | null };
  recommendation: string;
  references: { external_links: string[] };
  created_at: string;
}

interface FindingsData {
  findings: Finding[];
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    finding_id: string;
    action: 'verify' | 'reject';
    notes?: string;
  };

  if (!body.finding_id || !body.action || !['verify', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid payload: need finding_id and action (verify|reject)' }, { status: 400 });
  }

  // Read tracking.json — handle both 'findings' and 'issues' keys
  const trackingRaw = readJsonFile<TrackingData>('tracking.json');
  if (!trackingRaw) {
    return NextResponse.json({ error: 'tracking.json not found' }, { status: 404 });
  }

  const entries = trackingRaw.findings ?? trackingRaw.issues ?? [];
  const entryIndex = entries.findIndex((e) => e.id === body.finding_id);
  if (entryIndex === -1) {
    return NextResponse.json({ error: `Finding ${body.finding_id} not found in tracking` }, { status: 404 });
  }

  const entry = entries[entryIndex];
  const newStatus = body.action === 'verify' ? 'verified' : 'rejected';
  entry.status = newStatus;
  if (body.notes) {
    entry.notes = body.notes;
  }

  // If verifying, convert AI result finding to canonical Finding and append to findings.json
  if (body.action === 'verify') {
    const source = entry.source;
    const aiResults = readNestedJsonFile<AiResultFile>(`ai-results/${source}/findings.json`);

    if (aiResults) {
      const aiFinding = aiResults.findings.find((f) => f.id === body.finding_id);
      if (aiFinding) {
        const findingsData = readJsonFile<FindingsData>('findings.json') ?? { findings: [] };

        // Only add if not already present
        if (!findingsData.findings.some((f) => f.id === aiFinding.id)) {
          const canonicalFinding: Finding = {
            id: aiFinding.id,
            title: aiFinding.title,
            severity: aiFinding.severity,
            category: aiFinding.category ?? 'AI-Detected',
            description: aiFinding.description,
            root_cause: {
              locations: aiFinding.affected_code.map((ac) => ({
                file: ac.file,
                snippet: ac.snippet,
              })),
            },
            poc: { status: 'not_started', file: null, validation_memo: null },
            recommendation: '',
            references: { external_links: [] },
            created_at: new Date().toISOString(),
          };

          findingsData.findings.push(canonicalFinding);
          writeJsonFile('findings.json', findingsData);
        }
      }
    }
  }

  // Write back tracking.json using the original key
  const key = trackingRaw.findings ? 'findings' : trackingRaw.issues ? 'issues' : 'findings';
  writeJsonFile('tracking.json', { [key]: entries });

  return NextResponse.json({ ok: true, entry });
}
