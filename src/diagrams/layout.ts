/**
 * Deterministic layout: a diagram spec → a neutral scene (boxes, text, arrows
 * with absolute coordinates). Graph-shaped views use dagre; the privilege
 * matrix, the accounting view and the sequence view have purpose-built layouts.
 * The Excalidraw emitter (excalidraw.ts) turns a scene into a file.
 */
import dagre from '@dagrejs/dagre';
import type { DiagramSpec } from '../types/index.js';

export type ShapeStyle =
  | 'title'
  | 'takeaway'
  | 'actor'
  | 'holding'
  | 'function'
  | 'state'
  | 'state-terminal'
  | 'term'
  | 'participant'
  | 'header'
  | 'cell'
  | 'dot'
  | 'worst-case'
  | 'equation'
  | 'risk'
  | 'note'
  | 'callout-risk'
  | 'callout-note'
  | 'label';

export type ArrowStyle =
  | 'move'
  | 'transition'
  | 'increase'
  | 'decrease'
  | 'set'
  | 'call'
  | 'callback'
  | 'oracle'
  | 'transfer'
  | 'state'
  | 'annotation'
  | 'lifeline'
  | 'rule';

export interface Shape {
  id: string;
  kind: 'rect' | 'ellipse' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  style: ShapeStyle;
  fontSize: number;
  ref?: string;
}

export interface Arrow {
  id: string;
  from?: string;
  to?: string;
  /** Absolute points, at least two. */
  points: Array<[number, number]>;
  label?: string;
  style: ArrowStyle;
  /** Plain line (no arrowhead): lifelines and matrix rules. */
  line?: boolean;
  /**
   * Place the label as free text at this fraction along the first segment
   * (0 = start) instead of binding it to the arrow's midpoint. Used where many
   * arrows cross in the middle (accounting).
   */
  labelAt?: number;
  /** Free label centred at this point (self-loops put it beside the loop). */
  labelCenter?: [number, number];
  /** Excalidraw binding focus (-1..1) at each end; spreads arrows that share a box. */
  startFocus?: number;
  endFocus?: number;
  ref?: string;
}

export interface Scene {
  shapes: Shape[];
  arrows: Arrow[];
  width: number;
  height: number;
}

const CHAR = 0.6; // average glyph width / font size for Excalidraw's hand-drawn font
const LOOP_RISE = 34; // how far a self-loop rises above (or drops below) its box
const LOOP_STEP = 44; // extra distance for each further loop on the same side
const LOOP_LABEL = 44; // room for a loop's label (two lines) beyond the loop
const PAD_X = 18;
const PAD_Y = 12;
const LINE_H = 1.25;

export function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > maxChars) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

/** Size a labelled box around wrapped text. */
function box(
  label: string,
  fontSize = 16,
  maxChars = 28,
  minW = 120,
): { label: string; w: number; h: number } {
  const lines = wrap(label, maxChars);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    label: lines.join('\n'),
    w: Math.max(minW, Math.ceil(longest * fontSize * CHAR + PAD_X * 2)),
    h: Math.ceil(lines.length * fontSize * LINE_H + PAD_Y * 2),
  };
}

function textBlock(
  label: string,
  fontSize: number,
  maxChars: number,
): { label: string; w: number; h: number } {
  const lines = wrap(label, maxChars);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    label: lines.join('\n'),
    w: Math.ceil(longest * fontSize * CHAR),
    h: Math.ceil(lines.length * fontSize * LINE_H),
  };
}

interface Body {
  shapes: Shape[];
  arrows: Arrow[];
  width: number;
  height: number;
}

// ─── dagre-backed graph layout ──────────────────────────────────────

interface GNode {
  id: string;
  label: string;
  style: ShapeStyle;
  kind: 'rect' | 'ellipse';
  ref?: string;
  maxChars?: number;
}
interface GEdge {
  from: string;
  to: string;
  label?: string;
  style: ArrowStyle;
  ref?: string;
}

function graphLayout(nodes: GNode[], edges: GEdge[], rankdir: 'LR' | 'TB'): Body {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir, nodesep: 48, ranksep: 140, edgesep: 24, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const sizes = new Map<string, { label: string; w: number; h: number }>();
  // Self-loops (a transition back to the same state) are drawn by hand, the
  // first over the box, the second under it, then nested; dagre's own
  // self-edge routing does not survive Excalidraw. Room is reserved per side.
  const loops = new Map<string, number>();
  for (const e of edges) if (e.from === e.to) loops.set(e.from, (loops.get(e.from) ?? 0) + 1);
  const sideRoom = (n: number) => (n ? LOOP_RISE + (n - 1) * LOOP_STEP + LOOP_LABEL : 0);
  const room = (k: number) => ({
    top: sideRoom(Math.ceil(k / 2)),
    bottom: sideRoom(Math.floor(k / 2)),
  });
  for (const n of nodes) {
    const b = box(n.label, 16, n.maxChars ?? 26, n.kind === 'ellipse' ? 140 : 150);
    if (n.kind === 'ellipse') {
      b.w = Math.ceil(b.w * 1.25);
      b.h = Math.ceil(b.h * 1.3);
    }
    sizes.set(n.id, b);
    const r = room(loops.get(n.id) ?? 0);
    g.setNode(n.id, { width: b.w, height: b.h + r.top + r.bottom });
  }
  edges.forEach((e, i) => {
    if (!sizes.has(e.from) || !sizes.has(e.to) || e.from === e.to) return;
    const lbl = e.label ? textBlock(e.label, 14, 30) : null;
    g.setEdge(
      e.from,
      e.to,
      lbl ? { width: lbl.w + 12, height: lbl.h + 6, labelpos: 'c' } : {},
      `e${i}`,
    );
  });
  dagre.layout(g);

  const shapes: Shape[] = [];
  const placed = new Map<string, { x: number; y: number; w: number; h: number }>();
  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    const ln = g.node(n.id);
    if (!ln) continue;
    const b = sizes.get(n.id)!;
    const x = Math.round(ln.x - b.w / 2);
    // With loops, the box sits between the room reserved above and below it.
    const y = Math.round(ln.y - ln.height / 2 + room(loops.get(n.id) ?? 0).top);
    placed.set(n.id, { x, y, w: b.w, h: b.h });
    shapes.push({
      id: n.id,
      kind: n.kind,
      x,
      y,
      w: b.w,
      h: b.h,
      label: b.label,
      style: n.style,
      fontSize: 16,
      ...(n.ref ? { ref: n.ref } : {}),
    });
    maxX = Math.max(maxX, x + b.w);
    maxY = Math.max(maxY, y + b.h);
  }
  const arrows: Arrow[] = [];
  const loopIndex = new Map<string, number>();
  // An end that dagre aimed at a node's reserved loop room is pulled onto the box.
  const onBox = (id: string, [x, y]: [number, number]): [number, number] => {
    const b = placed.get(id);
    if (!b || !loops.has(id)) return [x, y];
    return [x, Math.min(Math.max(y, b.y + 6), b.y + b.h - 6)];
  };
  edges.forEach((e, i) => {
    if (e.from === e.to) {
      const b = placed.get(e.from);
      if (!b) return;
      const j = loopIndex.get(e.from) ?? 0;
      loopIndex.set(e.from, j + 1);
      const below = j % 2 === 1;
      const nest = Math.floor(j / 2);
      const rise = LOOP_RISE + nest * LOOP_STEP;
      const inset = Math.max(10, Math.round(b.w * (0.16 + nest * 0.08)));
      const edge = below ? b.y + b.h : b.y;
      const far = below ? edge + rise : edge - rise;
      const label = e.label ? wrap(e.label, 30).join('\n') : undefined;
      const labelH = label ? label.split('\n').length * 14 * LINE_H : 0;
      // Unbound on purpose: Excalidraw re-aims both ends of a bound arrow at the
      // element's centre on load, which collapses a loop onto one point.
      arrows.push({
        id: `${e.from}->${e.to}#${i}`,
        points: [
          [b.x + inset, edge],
          [b.x + inset, far],
          [b.x + b.w - inset, far],
          [b.x + b.w - inset, edge],
        ],
        ...(label
          ? {
              label,
              labelCenter: [
                Math.round(b.x + b.w / 2),
                Math.round(below ? far + 6 + labelH / 2 : far - 6 - labelH / 2),
              ] as [number, number],
            }
          : {}),
        style: e.style,
        ...(e.ref ? { ref: e.ref } : {}),
      });
      maxY = Math.max(maxY, below ? far + 6 + labelH : edge);
      return;
    }
    const le = g.edge({ v: e.from, w: e.to, name: `e${i}` });
    if (!le?.points) return;
    const pts = le.points.map(
      (p: { x: number; y: number }) => [Math.round(p.x), Math.round(p.y)] as [number, number],
    );
    pts[0] = onBox(e.from, pts[0]);
    pts[pts.length - 1] = onBox(e.to, pts[pts.length - 1]);
    for (const [x, y] of pts) {
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    arrows.push({
      id: `${e.from}->${e.to}#${i}`,
      from: e.from,
      to: e.to,
      points: pts,
      ...(e.label ? { label: wrap(e.label, 30).join('\n') } : {}),
      style: e.style,
      ...(e.ref ? { ref: e.ref } : {}),
    });
  });
  return { shapes, arrows, width: maxX, height: maxY };
}

// ─── per-type layouts ───────────────────────────────────────────────

function custody(spec: Extract<DiagramSpec, { type: 'custody' }>): Body {
  const nodes: GNode[] = [
    ...spec.actors.map((a) => ({
      id: a.id,
      label: a.label,
      style: 'actor' as const,
      kind: 'ellipse' as const,
      ref: a.ref,
    })),
    ...spec.holdings.map((h) => ({
      id: h.id,
      label: h.assets.length ? `${h.label}\n${h.assets.join(' · ')}` : h.label,
      style: 'holding' as const,
      kind: 'rect' as const,
      ref: h.ref,
    })),
    ...annotationNodes(spec),
  ];
  const edges: GEdge[] = [
    ...spec.moves.map((m) => ({
      from: m.from,
      to: m.to,
      label: m.asset ? `${m.via} · ${m.asset}` : m.via,
      style: 'move' as const,
      ref: m.ref,
    })),
    ...annotationEdges(spec),
  ];
  return graphLayout(nodes, edges, 'LR');
}

function stateMachine(spec: Extract<DiagramSpec, { type: 'state-machine' }>): Body {
  const nodes: GNode[] = [
    ...spec.states.map((s) => ({
      id: s.id,
      label: s.label,
      style: (s.terminal ? 'state-terminal' : 'state') as ShapeStyle,
      kind: 'rect' as const,
    })),
    ...annotationNodes(spec),
  ];
  const edges: GEdge[] = [
    ...spec.transitions.map((t) => ({
      from: t.from,
      to: t.to,
      label: t.guard ? `${t.label}\n[${t.guard}]` : t.label,
      style: 'transition' as const,
      ref: t.ref,
    })),
    ...annotationEdges(spec),
  ];
  return graphLayout(nodes, edges, 'LR');
}

function annotationNodes(spec: DiagramSpec): GNode[] {
  return spec.annotations.map((a, i) => ({
    id: `note-${i}`,
    label: a.text,
    style: a.kind === 'risk' ? ('risk' as const) : ('note' as const),
    kind: 'rect' as const,
    maxChars: 30,
  }));
}
function annotationEdges(spec: DiagramSpec): GEdge[] {
  return spec.annotations.map((a, i) => ({
    from: a.target,
    to: `note-${i}`,
    style: 'annotation' as const,
  }));
}

const CALLOUT = 22;

function callout(id: string, x: number, y: number, label: string, risk: boolean): Shape {
  return {
    id,
    kind: 'ellipse',
    x: Math.round(x),
    y: Math.round(y),
    w: CALLOUT,
    h: CALLOUT,
    label,
    style: risk ? 'callout-risk' : 'callout-note',
    fontSize: 13,
  };
}

/**
 * Annotations for non-graph layouts (matrix, accounting, sequence): a right-hand
 * column of notes, each tied to its target by a matching numbered callout.
 * Leader lines would cross a dense matrix or sequence and read as noise.
 */
function sideAnnotations(spec: DiagramSpec, body: Body): Body {
  if (!spec.annotations.length) return body;
  const x = body.width + 80;
  const shapes = [...body.shapes];
  let maxX = body.width;
  let maxY = body.height;
  // Number in reading order (top to bottom, then left to right).
  const items = spec.annotations
    .map((a, i) => ({ a, i, target: body.shapes.find((s) => s.id === a.target) }))
    .sort(
      (p, q) =>
        (p.target?.y ?? 0) - (q.target?.y ?? 0) ||
        (p.target?.x ?? 0) - (q.target?.x ?? 0) ||
        p.i - q.i,
    );
  let lastBottom = -Infinity;
  items.forEach(({ a, i, target }, n) => {
    const num = String(n + 1);
    const risk = a.kind === 'risk';
    const b = box(a.text, 15, 32, 160);
    const y = Math.max(target ? target.y : 0, lastBottom + 16);
    shapes.push({
      id: `note-${i}`,
      kind: 'rect',
      x,
      y,
      w: b.w,
      h: b.h,
      label: b.label,
      style: risk ? 'risk' : 'note',
      fontSize: 15,
    });
    shapes.push(callout(`note-${i}-num`, x - CALLOUT / 2, y - CALLOUT / 2, num, risk));
    if (target) {
      // On a box: over its top-right corner. On free text: just after it.
      const at =
        target.kind === 'text'
          ? callout(
              `note-${i}-at`,
              target.x + target.w + 6,
              target.y + target.h / 2 - CALLOUT / 2,
              num,
              risk,
            )
          : callout(
              `note-${i}-at`,
              target.x + target.w - CALLOUT / 2,
              target.y - CALLOUT / 2,
              num,
              risk,
            );
      shapes.push(at);
    }
    lastBottom = y + b.h;
    maxX = Math.max(maxX, x + b.w);
    maxY = Math.max(maxY, lastBottom);
  });
  return { shapes, arrows: body.arrows, width: maxX, height: maxY };
}

function privilege(spec: Extract<DiagramSpec, { type: 'privilege' }>): Body {
  const shapes: Shape[] = [];
  const arrows: Arrow[] = [];
  const powerCol = Math.max(220, ...spec.powers.map((p) => box(p.label, 16, 30).w));
  const colW = spec.actors.map((a) => Math.max(120, box(a.label, 16, 16).w));
  const worstX = powerCol + colW.reduce((s, w) => s + w, 0) + 24;
  const worstW = 380;
  const headerH = 56;
  const rowH = spec.powers.map((p) =>
    Math.max(52, textBlock(p.worst_case, 15, 44).h + 24, box(p.label, 16, 30).h + 8),
  );

  // Header row
  let x = powerCol;
  spec.actors.forEach((a, i) => {
    const t = textBlock(a.label, 16, 16);
    shapes.push({
      id: a.id,
      kind: 'text',
      x: x + (colW[i] - t.w) / 2,
      y: (headerH - t.h) / 2,
      w: t.w,
      h: t.h,
      label: t.label,
      style: 'header',
      fontSize: 16,
      ...(a.ref ? { ref: a.ref } : {}),
    });
    x += colW[i];
  });
  const wc = textBlock('Worst case', 16, 20);
  shapes.push({
    id: 'worst-case-header',
    kind: 'text',
    x: worstX,
    y: (headerH - wc.h) / 2,
    w: wc.w,
    h: wc.h,
    label: wc.label,
    style: 'header',
    fontSize: 16,
  });
  const totalW = worstX + worstW;
  arrows.push({
    id: 'rule-header',
    points: [
      [0, headerH],
      [totalW, headerH],
    ],
    style: 'rule',
    line: true,
  });

  let y = headerH;
  spec.powers.forEach((p, r) => {
    const h = rowH[r];
    const lb = textBlock(p.label, 16, 30);
    shapes.push({
      id: p.id,
      kind: 'text',
      x: 0,
      y: y + (h - lb.h) / 2,
      w: lb.w,
      h: lb.h,
      label: lb.label,
      style: 'label',
      fontSize: 16,
      ...(p.ref ? { ref: p.ref } : {}),
    });
    let cx = powerCol;
    spec.actors.forEach((a, i) => {
      if (spec.grants.some((g) => g.actor === a.id && g.power === p.id)) {
        const d = 18;
        shapes.push({
          id: `grant-${a.id}-${p.id}`,
          kind: 'ellipse',
          x: cx + (colW[i] - d) / 2,
          y: y + (h - d) / 2,
          w: d,
          h: d,
          label: '',
          style: 'dot',
          fontSize: 16,
        });
      }
      cx += colW[i];
    });
    const wt = textBlock(p.worst_case, 15, 44);
    shapes.push({
      id: `worst-${p.id}`,
      kind: 'text',
      x: worstX,
      y: y + (h - wt.h) / 2,
      w: wt.w,
      h: wt.h,
      label: wt.label,
      style: 'worst-case',
      fontSize: 15,
    });
    y += h;
    arrows.push({
      id: `rule-${p.id}`,
      points: [
        [0, y],
        [totalW, y],
      ],
      style: 'rule',
      line: true,
    });
  });
  return sideAnnotations(spec, { shapes, arrows, width: totalW, height: y });
}

function accounting(spec: Extract<DiagramSpec, { type: 'accounting' }>): Body {
  const shapes: Shape[] = [];
  const arrows: Arrow[] = [];
  const eq = textBlock(spec.equation, 22, 70);
  shapes.push({
    id: 'equation',
    kind: 'text',
    x: 0,
    y: 0,
    w: eq.w,
    h: eq.h,
    label: eq.label,
    style: 'equation',
    fontSize: 22,
  });
  const top = eq.h + 48;
  // Order functions by the mean position of the terms they update (barycenter),
  // which removes most arrow crossings.
  const termIndex = new Map(spec.terms.map((t, i) => [t.id, i]));
  const fnOrder = [...new Map(spec.updates.map((u) => [u.function, u.ref])).entries()].map(
    ([label, ref], i) => {
      const idx = spec.updates
        .filter((u) => u.function === label)
        .map((u) => termIndex.get(u.term) ?? 0);
      return { label, ref, i, bary: idx.reduce((a, b) => a + b, 0) / Math.max(idx.length, 1) };
    },
  );
  fnOrder.sort((a, b) => a.bary - b.bary || a.i - b.i);
  const fns = fnOrder.map((f) => [f.label, f.ref] as const);
  const termBoxes = spec.terms.map((t) => ({ ...t, b: box(t.label, 16, 24, 160) }));
  const fnBoxes = fns.map(([label, ref]) => ({ label, ref, b: box(label, 16, 28, 180) }));
  const leftW = Math.max(...termBoxes.map((t) => t.b.w), 160);
  const gap = 300;
  const fnX = leftW + gap;
  const rowGap = 28;

  // Spread the terms over the height of the function column so arrows fan out.
  const fnColumnH = fnBoxes.reduce((s2, f) => s2 + f.b.h + rowGap, -rowGap);
  const termColumnH = termBoxes.reduce((s2, t) => s2 + t.b.h, 0);
  const termGap =
    termBoxes.length > 1
      ? Math.max(rowGap * 2, (fnColumnH - termColumnH) / (termBoxes.length - 1))
      : 0;
  let y = top + (termBoxes.length === 1 ? Math.max(0, (fnColumnH - termColumnH) / 2) : 0);
  const termPos = new Map<string, Shape>();
  for (const t of termBoxes) {
    const s: Shape = {
      id: t.id,
      kind: 'rect',
      x: 0,
      y,
      w: t.b.w,
      h: t.b.h,
      label: t.b.label,
      style: 'term',
      fontSize: 16,
    };
    shapes.push(s);
    termPos.set(t.id, s);
    y += t.b.h + termGap;
  }
  y -= termGap - rowGap;
  let fy = top;
  const fnPos = new Map<string, Shape>();
  fnBoxes.forEach((f, i) => {
    const s: Shape = {
      id: `fn-${i}`,
      kind: 'rect',
      x: fnX,
      y: fy,
      w: f.b.w,
      h: f.b.h,
      label: f.b.label,
      style: 'function',
      fontSize: 16,
      ...(f.ref ? { ref: f.ref } : {}),
    };
    shapes.push(s);
    fnPos.set(f.label, s);
    fy += f.b.h + rowGap;
  });
  const sign = { increase: '+', decrease: '−', set: '=' } as const;
  // Spread arrow ends along each box edge so arrows into one box do not merge.
  const valid = spec.updates.filter((u) => termPos.has(u.term) && fnPos.has(u.function));
  const slot = (key: (u: (typeof valid)[number]) => string) => {
    const seen = new Map<string, number>();
    const total = new Map<string, number>();
    for (const u of valid) total.set(key(u), (total.get(key(u)) ?? 0) + 1);
    return valid.map((u) => {
      const k = key(u);
      const i = seen.get(k) ?? 0;
      seen.set(k, i + 1);
      return (i + 1) / ((total.get(k) ?? 1) + 1);
    });
  };
  const termSlot = slot((u) => u.term);
  const fnSlot = slot((u) => u.function);
  valid.forEach((u, i) => {
    const t = termPos.get(u.term)!;
    const f = fnPos.get(u.function)!;
    arrows.push({
      id: `upd-${i}`,
      from: f.id,
      to: t.id,
      points: [
        [f.x, Math.round(f.y + f.h * fnSlot[i])],
        [t.x + t.w, Math.round(t.y + t.h * termSlot[i])],
      ],
      label: sign[u.direction],
      labelAt: 0.12,
      startFocus: (fnSlot[i] - 0.5) * 1.6,
      endFocus: (termSlot[i] - 0.5) * 1.6,
      style: u.direction,
      ...(u.ref ? { ref: u.ref } : {}),
    });
  });
  const width = Math.max(eq.w, fnX + Math.max(...fnBoxes.map((f) => f.b.w), 0));
  return sideAnnotations(spec, { shapes, arrows, width, height: Math.max(y, fy) });
}

function sequence(spec: Extract<DiagramSpec, { type: 'sequence' }>): Body {
  const shapes: Shape[] = [];
  const arrows: Arrow[] = [];
  const colGap = 90;
  const msgGap = 64;
  const boxes = spec.participants.map((p) => ({ ...p, b: box(p.label, 16, 18, 140) }));
  const headH = Math.max(...boxes.map((b) => b.b.h));
  const centers = new Map<string, number>();
  let x = 0;
  for (const p of boxes) {
    shapes.push({
      id: p.id,
      kind: p.kind === 'actor' ? 'ellipse' : 'rect',
      x,
      y: 0,
      w: p.b.w,
      h: headH,
      label: p.b.label,
      style: p.kind === 'actor' ? 'actor' : p.kind === 'external' ? 'holding' : 'participant',
      fontSize: 16,
      ...(p.ref ? { ref: p.ref } : {}),
    });
    centers.set(p.id, x + p.b.w / 2);
    x += p.b.w + colGap;
  }
  const width = x - colGap;
  let y = headH + 56;
  let noteRight = width;
  spec.messages.forEach((m, i) => {
    const fx = centers.get(m.from);
    const tx = centers.get(m.to);
    if (fx === undefined || tx === undefined) return;
    const pts: Array<[number, number]> =
      fx === tx
        ? [
            [fx, y - 12],
            [fx + 60, y - 12],
            [fx + 60, y + 12],
            [fx, y + 12],
          ]
        : [
            [fx, y],
            [tx, y],
          ];
    arrows.push({
      id: `msg-${i}`,
      points: pts,
      label: m.label,
      style: m.kind,
      ...(m.ref ? { ref: m.ref } : {}),
    });
    if (m.note) {
      const n = box(m.note, 14, 34, 140);
      const nx = width + 60;
      shapes.push({
        id: `msgnote-${i}`,
        kind: 'rect',
        x: nx,
        y: y - n.h / 2,
        w: n.w,
        h: n.h,
        label: n.label,
        style: 'note',
        fontSize: 14,
      });
      noteRight = Math.max(noteRight, nx + n.w);
    }
    y += msgGap;
  });
  for (const p of boxes) {
    const cx = centers.get(p.id)!;
    arrows.push({
      id: `life-${p.id}`,
      points: [
        [cx, headH],
        [cx, y],
      ],
      style: 'lifeline',
      line: true,
    });
  }
  return sideAnnotations(spec, { shapes, arrows, width: noteRight, height: y });
}

/** Lay out a spec: header (title + takeaway) above the type-specific body. */
export function layoutDiagram(spec: DiagramSpec): Scene {
  const title = textBlock(spec.title, 28, 60);
  const takeaway = textBlock(spec.takeaway, 17, 96);
  const header: Shape[] = [
    {
      id: 'title',
      kind: 'text',
      x: 0,
      y: 0,
      w: title.w,
      h: title.h,
      label: title.label,
      style: 'title',
      fontSize: 28,
    },
    {
      id: 'takeaway',
      kind: 'text',
      x: 0,
      y: title.h + 12,
      w: takeaway.w,
      h: takeaway.h,
      label: takeaway.label,
      style: 'takeaway',
      fontSize: 17,
    },
  ];
  const top = title.h + 12 + takeaway.h + 56;
  let body: Body;
  switch (spec.type) {
    case 'custody':
      body = custody(spec);
      break;
    case 'state-machine':
      body = stateMachine(spec);
      break;
    case 'privilege':
      body = privilege(spec);
      break;
    case 'accounting':
      body = accounting(spec);
      break;
    case 'sequence':
      body = sequence(spec);
      break;
  }
  // Leaders and loops can rise above the body's origin; keep them below the header.
  const minY = Math.min(
    0,
    ...body.shapes.map((s) => s.y),
    ...body.arrows.flatMap((a) => a.points.map(([, py]) => py)),
    ...body.arrows.map((a) => (a.labelCenter ? a.labelCenter[1] - 20 : 0)),
  );
  const dy = top - minY;
  const shift = <T extends { y: number }>(s: T): T => ({ ...s, y: s.y + dy });
  return {
    shapes: [...header, ...body.shapes.map(shift)],
    arrows: body.arrows.map((a) => ({
      ...a,
      points: a.points.map(([px, py]) => [px, py + dy] as [number, number]),
      ...(a.labelCenter
        ? { labelCenter: [a.labelCenter[0], a.labelCenter[1] + dy] as [number, number] }
        : {}),
    })),
    width: Math.max(title.w, takeaway.w, body.width),
    height: dy + body.height,
  };
}
