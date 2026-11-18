/**
 * Automatic draft alignment of a floor-plan sheet to a building's OpenStreetMap footprint.
 *
 * 1. Find the building drawing on the sheet: dark pixels, joined by a small dilation, largest
 *    component that is not a frame (page border, title box). Fill it into a silhouette.
 * 2. Rasterise the footprint the same way, in metres.
 * 3. Search rotation (1 degree steps), scale and translation for the best overlap (IoU).
 *    The result is a similarity transform (no stretching), expressed as four control points.
 * The best pose at least 20 degrees away from the winner is refined too; when it scores almost
 * as well the orientation is ambiguous (symmetric buildings) and the caller must not trust it.
 */
import type { ControlPoint, LngLat, Px } from './georef';

export interface AutoAlignResult {
  controlPoints: ControlPoint[];
  iou: number;
  /** Refined IoU of the best pose at least 20 degrees from the winner. Close to iou = ambiguous. */
  runnerUpIou: number;
  metresPerPixel: number;
  rotationDeg: number;
}

const M_LAT = 110574;
const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

interface Grid { w: number; h: number; d: Uint8Array }

function maskFrom(img: ImageData, side: number): { g: Grid; k: number } {
  const k = side / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const d = new Uint8Array(w * h);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4;
    if (img.data[i + 3] > 0 && img.data[i] + img.data[i + 1] + img.data[i + 2] < 384) d[Math.min(h - 1, Math.floor(y * k)) * w + Math.min(w - 1, Math.floor(x * k))] = 1;
  }
  return { g: { w, h, d }, k };
}

function dilate(g: Grid, r: number): Grid {
  const o = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.d[y * g.w + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < g.w && Y < g.h) o[Y * g.w + X] = 1;
    }
  return { ...g, d: o };
}

function components(g: Grid) {
  const lab = new Int32Array(g.w * g.h).fill(-1);
  const comps: { n: number; x0: number; y0: number; x1: number; y1: number; edge: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < g.d.length; s++) {
    if (!g.d[s] || lab[s] >= 0) continue;
    const c = { n: 0, x0: g.w, y0: g.h, x1: 0, y1: 0, edge: 0 }, id = comps.length;
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, x = p % g.w, y = (p - x) / g.w;
      c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, q = Y * g.w + X;
        if (X >= 0 && Y >= 0 && X < g.w && Y < g.h && g.d[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
      }
    }
    comps.push(c);
  }
  // Pixels near the component's own bounding-box edge: high for frames and title boxes.
  for (let p = 0; p < lab.length; p++) {
    const id = lab[p]; if (id < 0) continue;
    const c = comps[id], x = p % g.w, y = (p - x) / g.w;
    if (x - c.x0 < 2 || c.x1 - x < 2 || y - c.y0 < 2 || c.y1 - y < 2) c.edge++;
  }
  return { lab, comps };
}

/** Fill holes: everything not reachable from outside the grid. */
function fill(g: Grid): Grid {
  const out = new Uint8Array(g.w * g.h), seen = new Uint8Array(g.w * g.h), stack: number[] = [];
  const push = (q: number) => { if (!seen[q] && !g.d[q]) { seen[q] = 1; stack.push(q); } };
  for (let x = 0; x < g.w; x++) { push(x); push((g.h - 1) * g.w + x); }
  for (let y = 0; y < g.h; y++) { push(y * g.w); push(y * g.w + g.w - 1); }
  while (stack.length) {
    const p = stack.pop()!, x = p % g.w, y = (p - x) / g.w;
    if (x > 0) push(p - 1); if (x < g.w - 1) push(p + 1); if (y > 0) push(p - g.w); if (y < g.h - 1) push(p + g.w);
  }
  for (let p = 0; p < out.length; p++) out[p] = seen[p] ? 0 : 1;
  return { ...g, d: out };
}

function inPoly(pt: Px, ring: Px[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** img: the rendered sheet. footprint: outer rings of the building in lng/lat. */
/**
 * opts.metresPerPixel and opts.rotationDeg pin scale and orientation to those of another floor of
 * the same building (same drawing scale and sheet orientation); only the position is then searched.
 */
export function autoAlign(img: ImageData, footprint: LngLat[][], opts: { metresPerPixel?: number; rotationDeg?: number } = {}): AutoAlignResult | null {
  const { g: raw, k } = maskFrom(img, 500);
  const joined = dilate(raw, 2);
  const { lab, comps } = components(joined);
  const cand = comps.map((c, id) => ({ ...c, id })).filter((c) => c.n > 200 && c.edge / c.n < 0.35 && c.x1 - c.x0 < joined.w * 0.97 && c.y1 - c.y0 < joined.h * 0.97);
  if (!cand.length) return null;
  const best = cand.sort((a, b) => b.n - a.n)[0];
  const sub: Grid = { w: best.x1 - best.x0 + 3, h: best.y1 - best.y0 + 3, d: new Uint8Array((best.x1 - best.x0 + 3) * (best.y1 - best.y0 + 3)) };
  for (let p = 0; p < lab.length; p++) if (lab[p] === best.id) { const x = p % joined.w, y = (p - x) / joined.w; sub.d[(y - best.y0 + 1) * sub.w + (x - best.x0 + 1)] = 1; }
  const sil = fill(sub);
  const silPts: Px[] = [];
  for (let p = 0; p < sil.d.length; p++) if (sil.d[p]) silPts.push([(p % sil.w) + 0.5, Math.floor(p / sil.w) + 0.5]);
  if (silPts.length < 50) return null;

  const all = footprint.flat();
  const lng0 = all.reduce((s, p) => s + p[0], 0) / all.length, lat0 = all.reduce((s, p) => s + p[1], 0) / all.length;
  const kx = mLng(lat0);
  const rings: Px[][] = footprint.map((r) => r.map((p) => [(p[0] - lng0) * kx, (p[1] - lat0) * M_LAT]));
  let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y); }
  const cellM = Math.max(fx1 - fx0, fy1 - fy0) / 120;
  const fw = Math.ceil((fx1 - fx0) / cellM) + 1, fh = Math.ceil((fy1 - fy0) / cellM) + 1;
  const foot = new Uint8Array(fw * fh);
  let footArea = 0, cxF = 0, cyF = 0;
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
    const pt: Px = [fx0 + (i + 0.5) * cellM, fy0 + (j + 0.5) * cellM];
    if (rings.some((r) => inPoly(pt, r))) { foot[j * fw + i] = 1; footArea++; cxF += pt[0]; cyF += pt[1]; }
  }
  if (!footArea) return null;
  cxF /= footArea; cyF /= footArea;
  const cxS = silPts.reduce((s, p) => s + p[0], 0) / silPts.length, cyS = silPts.reduce((s, p) => s + p[1], 0) / silPts.length;

  // Drawing cell (u, v; y down) -> metres east/north: rotate by theta (counter-clockwise), scale s.
  const place = (u: number, v: number, d: number, s: number, tx: number, ty: number): Px => {
    const t = (d * Math.PI) / 180, du = u - cxS, dv = -(v - cyS);
    return [cxF + tx + s * (du * Math.cos(t) - dv * Math.sin(t)), cyF + ty + s * (du * Math.sin(t) + dv * Math.cos(t))];
  };
  const score = (d: number, s: number, tx: number, ty: number) => {
    let hit = 0;
    for (const [u, v] of silPts) {
      const [e, n] = place(u, v, d, s, tx, ty);
      const i = Math.floor((e - fx0) / cellM), j = Math.floor((n - fy0) / cellM);
      if (i >= 0 && j >= 0 && i < fw && j < fh && foot[j * fw + i]) hit++;
    }
    const inter = hit * s * s;
    return inter / (silPts.length * s * s + footArea * cellM * cellM - inter);
  };
  const lockScale = opts.metresPerPixel != null, lockRot = opts.rotationDeg != null;
  const refine = (d0: number, s0: number) => {
    let pose = { iou: score(d0, s0, 0, 0), d: d0, s: s0, tx: 0, ty: 0 };
    for (const step of [4, 2, 1, 0.5]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const [dd, ds, dx, dy] of [[step / 4, 0, 0, 0], [-step / 4, 0, 0, 0], [0, 0.02 * step, 0, 0], [0, -0.02 * step, 0, 0], [0, 0, step, 0], [0, 0, -step, 0], [0, 0, 0, step], [0, 0, 0, -step]].filter(([dd, ds]) => !(lockRot && dd) && !(lockScale && ds))) {
          const c = { d: pose.d + dd, s: pose.s * (1 + ds), tx: pose.tx + dx, ty: pose.ty + dy };
          const v = score(c.d, c.s, c.tx, c.ty);
          if (v > pose.iou + 1e-4) { pose = { iou: v, ...c }; improved = true; }
        }
      }
    }
    return pose;
  };
  // With scale locked, a smaller upper floor still scores best where it overlaps the footprint most.
  const s0 = lockScale ? opts.metresPerPixel! / k : Math.sqrt((footArea * cellM * cellM) / silPts.length);
  const coarse = (lockRot ? [opts.rotationDeg!] : Array.from({ length: 360 }, (_, d) => d)).map((d) => [score(d, s0, 0, 0), d] as const).sort((a, b) => b[0] - a[0]);
  // Refine distinct orientation peaks (at least 20 degrees apart), not just the top few angles.
  const peaks: number[] = [];
  for (const [, d] of coarse) {
    if (peaks.every((p) => Math.min(Math.abs(p - d), 360 - Math.abs(p - d)) >= 20)) peaks.push(d);
    if (peaks.length === 4) break;
  }
  const poses = peaks.map((d) => refine(d, s0)).sort((a, b) => b.iou - a.iou);
  const win = poses[0];
  const apart = (a: number, b: number) => { const x = Math.abs(((a - b) % 360) + 360) % 360; return Math.min(x, 360 - x) >= 20; };
  const rival = poses.find((p) => apart(p.d, win.d));
  const rot = ((win.d % 360) + 360) % 360;
  const toLL = (u: number, v: number): LngLat => { const [e, n] = place(u, v, win.d, win.s, win.tx, win.ty); return [+(lng0 + e / kx).toFixed(7), +(lat0 + n / M_LAT).toFixed(7)]; };
  const note = `Automatic fit of the drawing outline to the OpenStreetMap footprint (overlap ${(win.iou * 100).toFixed(0)}%). Draft: check against the map.`;
  return {
    controlPoints: [[0, 0], [sub.w, 0], [sub.w, sub.h], [0, sub.h]].map(([u, v]) => ({ px: [Math.round((u + best.x0 - 1) / k), Math.round((v + best.y0 - 1) / k)] as Px, lngLat: toLL(u, v), note })),
    iou: win.iou,
    runnerUpIou: rival?.iou ?? 0,
    metresPerPixel: win.s * k,
    rotationDeg: rot,
  };
}
