/**
 * Lines one floor's drawing up against another floor of the same building by their walls.
 * Exterior walls, columns and stair and elevator cores repeat from floor to floor, so the
 * transform that lays most of one floor's walls onto the other's is how the sheets relate,
 * even when one sheet is turned (portrait vs landscape) or the drawing sits elsewhere on it.
 * Used to match stairs and elevators across floors by position (floorImports verticalLinksFor).
 */

export interface Mask { w: number; h: number; d: Uint8Array }
/** Sheet pixels of the moving floor -> sheet pixels of the reference floor: [a, b, c, d, e, f], x' = a x + b y + c, y' = d x + e y + f. */
export type Affine = [number, number, number, number, number, number];
export interface Registration { m: Affine; score: number; runnerUp: number; turn: number }

/** Dark pixels of a sheet (gray 0-255, row-major) pooled to cells of `cell` sheet pixels. */
export function maskOf(gray: Uint8Array, w: number, h: number, cell: number, dark = 128): Mask {
  const W = Math.ceil(w / cell), H = Math.ceil(h / cell), d = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (gray[y * w + x] < dark) d[((y / cell) | 0) * W + ((x / cell) | 0)] = 1;
  return { w: W, h: H, d };
}

/** Keeps only the building drawing: the largest group of marks that is not a page frame or title box. */
export function buildingOnly(m: Mask): Mask {
  const joined = dilate(m, 2);
  const lab = new Int32Array(m.w * m.h).fill(-1);
  let best = { n: 0, x0: 0, y0: 0, x1: m.w - 1, y1: m.h - 1 };
  for (let s = 0, id = 0; s < lab.length; s++) {
    if (!joined.d[s] || lab[s] >= 0) continue;
    const c = { n: 0, x0: m.w, y0: m.h, x1: 0, y1: 0 }, st = [s];
    lab[s] = id;
    while (st.length) {
      const p = st.pop()!, x = p % m.w, y = (p - x) / m.w;
      c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < m.w - 1 ? p + 1 : -1, p - m.w, p + m.w]) if (q >= 0 && q < lab.length && joined.d[q] && lab[q] < 0) { lab[q] = id; st.push(q); }
    }
    const frame = c.x1 - c.x0 > m.w * 0.95 || c.y1 - c.y0 > m.h * 0.95;
    if (!frame && c.n > best.n) best = c;
    id++;
  }
  const out = new Uint8Array(m.w * m.h);
  for (let y = best.y0; y <= best.y1; y++) for (let x = best.x0; x <= best.x1; x++) out[y * m.w + x] = m.d[y * m.w + x];
  return { ...m, d: out };
}

function dilate(m: Mask, r: number): Mask {
  const o = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.d[y * m.w + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < m.w && Y < m.h) o[Y * m.w + X] = 1;
    }
  return { ...m, d: o };
}

const pts = (m: Mask, max: number) => {
  const all: [number, number][] = [];
  for (let i = 0; i < m.d.length; i++) if (m.d[i]) all.push([i % m.w, (i / m.w) | 0]);
  if (all.length <= max) return all;
  const step = all.length / max;
  return Array.from({ length: max }, (_, k) => all[Math.floor(k * step)]);
};
const centroid = (p: [number, number][]) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/**
 * Best transform laying `moving` onto `ref` (both masks at the same cell size, in cells): a turn
 * of 0/90/180/270 degrees plus up to 3 degrees either way, scale 0.96-1.04, any shift within
 * `range` cells of matching the centres. score: share of the moving floor's marks that land on the
 * reference's (widened by one cell). runnerUp: best score of the other quarter turns.
 */
export function register(ref: Mask, moving: Mask, range = 60, turns: number[] = [0, 90, 180, 270]): Registration | null {
  const R = dilate(ref, 1);
  const P = pts(moving, 2500);
  if (P.length < 50) return null;
  const [mx, my] = centroid(P), [rx, ry] = centroid(pts(ref, 5000));
  const scoreAt = (deg: number, s: number, tx: number, ty: number) => {
    const t = (deg * Math.PI) / 180, c = Math.cos(t) * s, sn = Math.sin(t) * s;
    let hit = 0;
    for (const [u, v] of P) {
      const du = u - mx, dv = v - my;
      const x = Math.round(rx + tx + c * du - sn * dv), y = Math.round(ry + ty + sn * du + c * dv);
      if (x >= 0 && y >= 0 && x < R.w && y < R.h && R.d[y * R.w + x]) hit++;
    }
    return hit / P.length;
  };
  const perTurn: { turn: number; score: number; deg: number; s: number; tx: number; ty: number }[] = [];
  for (const turn of turns) {
    let best = { score: -1, deg: turn, s: 1, tx: 0, ty: 0 };
    for (const s of [0.96, 1, 1.04]) for (let tx = -range; tx <= range; tx += 3) for (let ty = -range; ty <= range; ty += 3) {
      const v = scoreAt(turn, s, tx, ty);
      if (v > best.score) best = { score: v, deg: turn, s, tx, ty };
    }
    // Refine: shift, small turn, scale.
    for (const step of [2, 1, 0.5]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const [dd, ds, dx, dy] of [[0, 0, step, 0], [0, 0, -step, 0], [0, 0, 0, step], [0, 0, 0, -step], [step / 2, 0, 0, 0], [-step / 2, 0, 0, 0], [0, 0.005 * step, 0, 0], [0, -0.005 * step, 0, 0]]) {
          const c = { deg: best.deg + dd, s: best.s + ds, tx: best.tx + dx, ty: best.ty + dy };
          if (Math.abs(c.deg - turn) > 3 || c.s < 0.95 || c.s > 1.05) continue;
          const v = scoreAt(c.deg, c.s, c.tx, c.ty);
          if (v > best.score + 1e-4) { best = { score: v, ...c }; improved = true; }
        }
      }
    }
    perTurn.push({ turn, ...best });
  }
  perTurn.sort((a, b) => b.score - a.score);
  const w = perTurn[0];
  const t = (w.deg * Math.PI) / 180, c = Math.cos(t) * w.s, sn = Math.sin(t) * w.s;
  // cells: x' = rx + tx + c (u - mx) - sn (v - my); y' = ry + ty + sn (u - mx) + c (v - my)
  return { m: [c, -sn, rx + w.tx - c * mx + sn * my, sn, c, ry + w.ty - sn * mx - c * my], score: w.score, runnerUp: perTurn[1]?.score ?? 0, turn: w.turn };
}

/** The same transform for sheet pixels when both masks use `cell` sheet pixels per cell. */
export const cellsToPixels = (m: Affine, cell: number): Affine => [m[0], m[1], (m[2] + 0.5) * cell - (m[0] + m[1]) * cell * 0.5, m[3], m[4], (m[5] + 0.5) * cell - (m[3] + m[4]) * cell * 0.5];

export const applyAffine = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
