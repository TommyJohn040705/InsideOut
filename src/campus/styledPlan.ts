/**
 * A clean, coloured picture of an imported floor in the style of the traced E5 maps
 * (tools/floorplan-tracer/build_floor.py): rooms filled by type, corridors pale, walls dark, and
 * everything outside the building transparent, so the drawing's text, title block and key map are
 * gone. Built from what buildPlanGraph already read off the drawing; same size as the sheet image,
 * so room and hallway positions (image percent) stay where they are.
 */
import type { PlanGraph } from './planGraph';

/** E5's colours by room type (build_floor.py CAT_COL). */
export const ROOM_FILL: Record<string, string> = {
  classroom: '#fde68a', conference: '#fde68a', lab: '#bbf7d0', workshop: '#bbf7d0', office: '#c7d2fe',
  restroom: '#bae6fd', elevator: '#e9d5ff', stairs: '#e9d5ff', study: '#fef3c7', dining: '#fef3c7',
  utility: '#e5e7eb', entrance: '#f1f5f9', exit: '#f1f5f9', bridge: '#f1f5f9', other: '#e5e7eb',
};
export const CORRIDOR_FILL = '#eef2f7', FLOOR_FILL = '#ffffff', WALL_FILL = '#334155';
/** An unlabelled space this many grid cells or bigger is open floor (atrium, hall), coloured like a corridor. */
const OPEN_FLOOR_CELLS = 2500;
const CORRIDOR_KINDS = new Set(['corridor', 'entrance', 'exit', 'bridge']);

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Fill colour of each space (index = region id), from the room labels that sit in it. */
export function regionFills(region: Int32Array, w: number, h: number, rooms: { coords: { x: number; y: number }; category?: string }[]): string[] {
  let n = 0;
  const size: number[] = [];
  for (let i = 0; i < region.length; i++) if (region[i] >= 0) { n = Math.max(n, region[i] + 1); size[region[i]] = (size[region[i]] || 0) + 1; }
  const fill: (string | undefined)[] = new Array(n);
  for (const r of rooms) {
    const cx = Math.min(w - 1, Math.max(0, Math.floor((r.coords.x / 100) * w))), cy = Math.min(h - 1, Math.max(0, Math.floor((r.coords.y / 100) * h)));
    const g = region[cy * w + cx];
    if (g < 0) continue;
    const cat = r.category || 'other';
    // A corridor label wins over a room whose doorway leaks into the corridor.
    if (CORRIDOR_KINDS.has(cat)) fill[g] = CORRIDOR_FILL;
    else if (!fill[g]) fill[g] = ROOM_FILL[cat] || ROOM_FILL.other;
  }
  return Array.from({ length: n }, (_, g) => fill[g] || ((size[g] || 0) >= OPEN_FLOOR_CELLS ? CORRIDOR_FILL : FLOOR_FILL));
}

/**
 * Cells inside the building outline: the groups of drawing (not the sheet's border frame) that hold
 * the floor's room labels, with their holes filled. Drops the title block, key map and frame that a
 * sheet read from its picture (no wall layers) would otherwise keep.
 */
export function buildingCells(walls: Uint8Array, imgW: number, imgH: number, w: number, h: number, cellPx: number, labels: { x: number; y: number }[] = []): Uint8Array {
  const marks = new Uint8Array(w * h);
  for (let y = 0; y < imgH; y++) for (let x = 0; x < imgW; x++) if (walls[y * imgW + x]) marks[((y / cellPx) | 0) * w + ((x / cellPx) | 0)] = 1;
  // Join wall pieces a doorway apart so one building is one group.
  const R = 3, joined = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (marks[y * w + x])
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) joined[Y * w + X] = 1; }
  const lab = new Int32Array(w * h).fill(-1);
  const groups: { id: number; n: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let s = 0, id = 0; s < lab.length; s++, id++) {
    if (!joined[s] || lab[s] >= 0) { id--; continue; }
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    const st = [s]; lab[s] = id;
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p - x) / w;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < lab.length && joined[q] && lab[q] < 0) { lab[q] = id; st.push(q); }
    }
    if (!(x1 - x0 > w * 0.9 || y1 - y0 > h * 0.9)) groups.push({ id, n, x0, y0, x1, y1 });
  }
  // Groups holding room labels are the building; with no labels, the largest group.
  const cells = labels.map((l) => [Math.floor((l.x / 100) * w), Math.floor((l.y / 100) * h)]);
  const held = groups.map((g) => cells.filter(([x, y]) => x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1).length);
  const most = Math.max(0, ...held);
  const keep = new Set(most ? groups.filter((_, i) => held[i] >= Math.max(2, Math.min(5, most * 0.15))).map((g) => g.id) : groups.sort((a, b) => b.n - a.n).slice(0, 1).map((g) => g.id));
  // Fill with openings up to 2 x CLOSE cells shut (a closing): flood the sheet edge around the
  // building's walls widened by CLOSE, then take CLOSE back, so wide doors and open hall fronts stay in.
  const CLOSE = 25;
  const wall = new Uint8Array(w * h);
  for (let i = 0; i < wall.length; i++) if (marks[i] && keep.has(lab[i])) wall[i] = 1;
  const dist = new Int32Array(w * h).fill(-1), q: number[] = [];
  for (let i = 0; i < wall.length; i++) if (wall[i]) { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) { const p = q[k], x = p % w; if (dist[p] >= CLOSE) continue; for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w, x > 0 ? p - w - 1 : -1, x < w - 1 ? p - w + 1 : -1, x > 0 ? p + w - 1 : -1, x < w - 1 ? p + w + 1 : -1]) if (n >= 0 && n < dist.length && dist[n] < 0) { dist[n] = dist[p] + 1; q.push(n); } }
  const reach = new Int32Array(w * h).fill(-1), st: number[] = [];
  const push = (n: number, d: number) => { if (reach[n] < 0 && dist[n] < 0) { reach[n] = d; st.push(n); } };
  for (let x = 0; x < w; x++) { push(x, 0); push((h - 1) * w + x, 0); }
  for (let y = 0; y < h; y++) { push(y * w, 0); push(y * w + w - 1, 0); }
  for (let k = 0; k < st.length; k++) { const p = st[k], x = p % w; for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (n >= 0 && n < reach.length) push(n, 0); }
  // Take the widening back: cells within CLOSE of the outside flood are outside too, except wall cells.
  const out = new Int32Array(w * h).fill(-1), o: number[] = [];
  for (let i = 0; i < reach.length; i++) if (reach[i] >= 0) { out[i] = 0; o.push(i); }
  for (let k = 0; k < o.length; k++) { const p = o[k], x = p % w; if (out[p] >= CLOSE) continue; for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w, x > 0 ? p - w - 1 : -1, x < w - 1 ? p - w + 1 : -1, x > 0 ? p + w - 1 : -1, x < w - 1 ? p + w + 1 : -1]) if (n >= 0 && n < out.length && out[n] < 0 && !wall[n]) { out[n] = out[p] + 1; o.push(n); } }
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < inside.length; i++) inside[i] = keep.size && out[i] < 0 ? 1 : 0;
  return inside;
}

/** RGBA pixels (imgW x imgH) of the styled floor. */
export function renderStyledPlan(pg: PlanGraph, imgW: number, imgH: number, rooms: { coords: { x: number; y: number }; category?: string }[]): Uint8ClampedArray {
  const { w, h, cellPx } = pg.grid, { walls, region } = pg.paint;
  // The building outline decides what is outside: the reader's own outside leaks into halls with wide openings.
  const inside = buildingCells(walls, imgW, imgH, w, h, cellPx, rooms.map((r) => r.coords));
  let nIn = 0, nReader = 0;
  for (let i = 0; i < inside.length; i++) { nIn += inside[i]; nReader += pg.paint.outside[i] ? 0 : 1; }
  // An outline much smaller than the reader's own inside missed parts of the building: use the reader's.
  const useOutline = nIn >= nReader * 0.6;
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < outside.length; i++) outside[i] = (useOutline ? !inside[i] : pg.paint.outside[i]) ? 1 : 0;
  // Nothing well beyond the outermost room labels is building (sheet border lines, notes in the margin).
  if (rooms.length >= 3) {
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (const r of rooms) { const x = (r.coords.x / 100) * w, y = (r.coords.y / 100) * h; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const mx = Math.max(8, (x1 - x0) * 0.12), my = Math.max(8, (y1 - y0) * 0.12);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < x0 - mx || x > x1 + mx || y < y0 - my || y > y1 + my) outside[y * w + x] = 1;
  }
  // The reader's inside also holds enclosed boxes on the sheet (key map, legend): keep only areas with a room label.
  if (!useOutline) {
    const lab = new Int32Array(w * h).fill(-1), labelled = new Set<number>();
    for (const r of rooms) { const c = Math.min(h - 1, Math.max(0, Math.floor((r.coords.y / 100) * h))) * w + Math.min(w - 1, Math.max(0, Math.floor((r.coords.x / 100) * w))); labelled.add(c); }
    for (let s = 0; s < lab.length; s++) {
      if (outside[s] || lab[s] >= 0) continue;
      const area = [s]; let hasLabel = false; lab[s] = s;
      for (let k = 0; k < area.length; k++) {
        const p = area[k], x = p % w; if (labelled.has(p)) hasLabel = true;
        for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (n >= 0 && n < lab.length && !outside[n] && lab[n] < 0) { lab[n] = s; area.push(n); }
      }
      if (!hasLabel) for (const p of area) outside[p] = 1;
    }
  }
  const fills = regionFills(region, w, h, rooms).map(rgb);
  const floor = rgb(FLOOR_FILL), wall = rgb(WALL_FILL);
  const out = new Uint8ClampedArray(imgW * imgH * 4);
  for (let y = 0; y < imgH; y++) for (let x = 0; x < imgW; x++) {
    const i = y * imgW + x, c = ((y / cellPx) | 0) * w + ((x / cellPx) | 0);
    let col: number[] | null;
    if (walls[i]) col = outside[c] && !nearInside(outside, w, h, c) ? null : wall;
    else if (outside[c]) col = null;
    else col = region[c] >= 0 ? fills[region[c]] : floor;
    if (!col) continue;
    out[i * 4] = col[0]; out[i * 4 + 1] = col[1]; out[i * 4 + 2] = col[2]; out[i * 4 + 3] = 255;
  }
  return out;
}

// A wall on the building's outer edge sits in an outside cell; keep it when an inside cell is next to it.
function nearInside(outside: Uint8Array, w: number, h: number, c: number): boolean {
  const x = c % w, y = (c / w) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < w && Y < h && !outside[Y * w + X]) return true;
  }
  return false;
}
