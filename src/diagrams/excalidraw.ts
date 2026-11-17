/**
 * Scene → Excalidraw file (`.excalidraw`, opens in the dashboard, excalidraw.com
 * and the VS Code extension). Text is bound inside its container, arrows are
 * bound to shapes, and every element that stands for a protocol entity carries
 * `customData.hexRef` so the dashboard can link it to code, notes and cards.
 */
import crypto from 'node:crypto';
import {
  plainText,
  type Arrow,
  type Scene,
  type Shape,
  type ShapeStyle,
  type ArrowStyle,
} from './layout.js';

/** Excalifont: the hand-drawn default font in Excalidraw 0.18. */
const FONT = 5;
const ROUGHNESS = 1;
const INK = '#1e293b';

const SHAPE_STYLE: Record<
  ShapeStyle,
  { stroke: string; fill: string; width: number; dash?: boolean; font?: string }
> = {
  title: { stroke: INK, fill: 'transparent', width: 1 },
  takeaway: { stroke: '#475569', fill: 'transparent', width: 1 },
  actor: { stroke: '#4338ca', fill: '#e0e7ff', width: 2 },
  holding: { stroke: '#b45309', fill: '#fef3c7', width: 2 },
  function: { stroke: '#334155', fill: '#f1f5f9', width: 1 },
  state: { stroke: '#0e7490', fill: '#ecfeff', width: 2 },
  'state-terminal': { stroke: '#0e7490', fill: '#cffafe', width: 4 },
  term: { stroke: '#4338ca', fill: '#eef2ff', width: 2 },
  participant: { stroke: '#334155', fill: '#f8fafc', width: 2 },
  header: { stroke: '#475569', fill: 'transparent', width: 1 },
  cell: { stroke: '#cbd5e1', fill: 'transparent', width: 1 },
  dot: { stroke: '#4338ca', fill: '#4338ca', width: 1 },
  'worst-case': { stroke: '#9f1239', fill: 'transparent', width: 1 },
  equation: { stroke: INK, fill: 'transparent', width: 1 },
  risk: { stroke: '#dc2626', fill: '#fee2e2', width: 2, dash: true },
  note: { stroke: '#64748b', fill: '#f8fafc', width: 1, dash: true },
  'callout-risk': { stroke: '#dc2626', fill: '#dc2626', width: 1, font: '#ffffff' },
  'callout-note': { stroke: '#64748b', fill: '#64748b', width: 1, font: '#ffffff' },
  label: { stroke: INK, fill: 'transparent', width: 1 },
};

const ARROW_STYLE: Record<
  ArrowStyle,
  { stroke: string; width: number; dash?: 'dashed' | 'dotted' }
> = {
  move: { stroke: '#b45309', width: 2 },
  transition: { stroke: '#0e7490', width: 2 },
  increase: { stroke: '#047857', width: 2 },
  decrease: { stroke: '#b91c1c', width: 2 },
  set: { stroke: '#4338ca', width: 2 },
  call: { stroke: INK, width: 2 },
  callback: { stroke: '#7c3aed', width: 2, dash: 'dashed' },
  oracle: { stroke: '#0369a1', width: 2, dash: 'dotted' },
  transfer: { stroke: '#b45309', width: 2 },
  state: { stroke: '#64748b', width: 1, dash: 'dotted' },
  annotation: { stroke: '#dc2626', width: 1, dash: 'dashed' },
  lifeline: { stroke: '#94a3b8', width: 1, dash: 'dashed' },
  rule: { stroke: '#e2e8f0', width: 1 },
};

// Excalidraw elements are plain JSON; typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = Record<string, any>;

function stableId(ns: string, id: string): string {
  return crypto.createHash('sha1').update(`${ns}:${id}`).digest('base64url').slice(0, 20);
}
function seedOf(id: string): number {
  return parseInt(crypto.createHash('sha1').update(id).digest('hex').slice(0, 8), 16) % 2 ** 31;
}

function base(id: string, type: string, x: number, y: number, w: number, h: number): El {
  return {
    id,
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: INK,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: ROUGHNESS,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: seedOf(id),
    version: 1,
    versionNonce: seedOf(id + ':n'),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

function textEl(
  id: string,
  s: { x: number; y: number; w: number; h: number },
  text: string,
  fontSize: number,
  color: string,
  containerId: string | null,
): El {
  text = plainText(text);
  return {
    ...base(id, 'text', s.x, s.y, s.w, s.h),
    strokeColor: color,
    text,
    originalText: text,
    fontSize,
    fontFamily: FONT,
    textAlign: containerId ? 'center' : 'left',
    verticalAlign: containerId ? 'middle' : 'top',
    containerId,
    autoResize: true,
    lineHeight: 1.25,
  };
}

export interface ExcalidrawFile {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: El[];
  appState: { viewBackgroundColor: string; gridSize: null };
  files: Record<string, never>;
  /** Hex bookkeeping; Excalidraw ignores unknown top-level keys. */
  hex: { name: string; type: string; spec_hash: string; edited: boolean };
}

export function toExcalidraw(
  scene: Scene,
  meta: { name: string; type: string; spec_hash: string },
): ExcalidrawFile {
  const elements: El[] = [];
  const shapeEl = new Map<string, El>();
  const ns = meta.name;

  for (const s of scene.shapes) {
    const st = SHAPE_STYLE[s.style];
    const id = stableId(ns, `shape:${s.id}`);
    if (s.kind === 'text') {
      const t = textEl(id, s, s.label, s.fontSize, st.stroke, null);
      if (s.style === 'title') t.fontSize = s.fontSize;
      if (s.ref) t.customData = { hexRef: s.ref, hexNode: s.id };
      elements.push(t);
      shapeEl.set(s.id, t);
      continue;
    }
    const el: El = {
      ...base(id, s.kind === 'ellipse' ? 'ellipse' : 'rectangle', s.x, s.y, s.w, s.h),
      strokeColor: st.stroke,
      backgroundColor: st.fill,
      strokeWidth: st.width,
      strokeStyle: st.dash ? 'dashed' : 'solid',
      roundness: s.kind === 'rect' ? { type: 3 } : null,
      customData: { hexNode: s.id, ...(s.ref ? { hexRef: s.ref } : {}) },
    };
    elements.push(el);
    shapeEl.set(s.id, el);
    if (s.label) {
      const tid = stableId(ns, `label:${s.id}`);
      const lines = s.label.split('\n');
      const th = Math.ceil(lines.length * s.fontSize * 1.25);
      const tw = Math.ceil(Math.max(...lines.map((l) => l.length)) * s.fontSize * 0.6);
      elements.push(
        textEl(
          tid,
          { x: s.x + (s.w - tw) / 2, y: s.y + (s.h - th) / 2, w: tw, h: th },
          s.label,
          s.fontSize,
          st.font ?? INK,
          id,
        ),
      );
      el.boundElements = [{ id: tid, type: 'text' }];
    }
  }

  for (const a of scene.arrows) {
    const st = ARROW_STYLE[a.style];
    const id = stableId(ns, `arrow:${a.id}`);
    const [x0, y0] = a.points[0];
    const rel = a.points.map(([x, y]) => [x - x0, y - y0]);
    const xs = rel.map((p) => p[0]);
    const ys = rel.map((p) => p[1]);
    const el: El = {
      ...base(
        id,
        a.line ? 'line' : 'arrow',
        x0,
        y0,
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ),
      strokeColor: st.stroke,
      strokeWidth: st.width,
      strokeStyle: st.dash ?? 'solid',
      roughness: a.line ? 0 : ROUGHNESS,
      roundness: a.points.length > 2 ? { type: 2 } : null,
      points: rel,
      lastCommittedPoint: null,
      startArrowhead: null,
      endArrowhead: a.line ? null : 'arrow',
      ...(a.ref ? { customData: { hexRef: a.ref } } : {}),
    };
    if (!a.line) {
      el.elbowed = false;
      const from = a.from ? shapeEl.get(a.from) : undefined;
      const to = a.to ? shapeEl.get(a.to) : undefined;
      el.startBinding =
        from && from.type !== 'text'
          ? { elementId: from.id, focus: a.startFocus ?? 0, gap: 6 }
          : null;
      el.endBinding =
        to && to.type !== 'text' ? { elementId: to.id, focus: a.endFocus ?? 0, gap: 6 } : null;
      for (const end of [from, to]) {
        if (end && end.type !== 'text')
          end.boundElements = [...(end.boundElements ?? []), { id, type: 'arrow' }];
      }
    }
    elements.push(el);
    if (a.label && !a.line) {
      const tid = stableId(ns, `arrowlabel:${a.id}`);
      const lines = a.label.split('\n');
      const fs = 14;
      const tw = Math.ceil(Math.max(...lines.map((l) => l.length)) * fs * 0.6);
      const th = Math.ceil(lines.length * fs * 1.25);
      const color = st.stroke === INK ? '#334155' : st.stroke;
      if (a.labelCenter) {
        // Free text at a point the layout chose (self-loops: beside the loop).
        const [cx, cy] = a.labelCenter;
        elements.push(
          textEl(tid, { x: cx - tw / 2, y: cy - th / 2, w: tw, h: th }, a.label, fs, color, null),
        );
      } else if (a.labelAt !== undefined) {
        // Free text near the start of the arrow, just above the line.
        const [ax, ay] = a.points[0];
        const [bx, by] = a.points[1];
        const cx = ax + (bx - ax) * a.labelAt;
        const cy = ay + (by - ay) * a.labelAt;
        const big = 20;
        elements.push(
          textEl(
            tid,
            {
              x: cx - (big * 0.6) / 2,
              y: cy - big * 1.25 - 2,
              w: Math.ceil(big * 0.6),
              h: Math.ceil(big * 1.25),
            },
            a.label,
            big,
            color,
            null,
          ),
        );
      } else {
        // Mid-point of the polyline's middle segment.
        const mid = Math.floor((a.points.length - 1) / 2);
        const [ax, ay] = a.points[mid];
        const [bx, by] = a.points[mid + 1] ?? a.points[mid];
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        elements.push(
          textEl(tid, { x: cx - tw / 2, y: cy - th / 2, w: tw, h: th }, a.label, fs, color, id),
        );
        el.boundElements = [{ id: tid, type: 'text' }];
      }
    }
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://github.com/andreitoma8/hex',
    elements,
    appState: { viewBackgroundColor: '#ffffff', gridSize: null },
    files: {},
    hex: { ...meta, edited: false },
  };
}
