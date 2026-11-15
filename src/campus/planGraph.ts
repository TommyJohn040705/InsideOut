/**
 * Hallway network read straight off a floor-plan drawing, so a floor can route before anyone
 * draws hallways by hand. Walls are the thick dark lines; text, door swings and leader lines are
 * thin and get removed. The open floor space left is thinned to centre-lines, which become
 * hallway nodes. A route on this network stays in open space and goes through doorway gaps,
 * never through a drawn wall. It is still a reading of a drawing: not walked, not reviewed.
 */
import type { CorridorNode, Point } from '../types/navigation';

export interface PlanGraphOptions {
  /** Dark lines thinner than this many image pixels are not walls (text, door arcs). */
  thinPx?: number;
  /** Stair boxes in image pixels (detectStairs) to add as rooms. */
  stairs?: { x0: number; y0: number; x1: number; y1: number }[];
  /** Doorways up to 2 x this many cells wide are closed when telling rooms from corridors. */
  doorCloseCells?: number;
  /** Edge-length multiplier inside rooms other than corridors, so routes keep to corridors. */
  roomCost?: number;
  /** A thin line counts as a wall when it runs straight for at least this many pixels. */
  straightPx?: number;
  /** Image pixels per grid cell. */
  cellPx?: number;
  /** Openings narrower than 2 x this many cells count as closed when finding the outside. */
  outsideCloseCells?: number;
  /** Grid cells between hallway nodes along a centre-line. */
  stepCells?: number;
  /** Furthest a room label may be from its hallway node, in cells. */
  roomLinkCells?: number;
}

export interface PlanGraph {
  hallways: CorridorNode[];
  linkedRoomIds: string[];
  unlinkedRoomIds: string[];
  /** Stairs found on the drawing and joined to the network (opts.stairs), to add to the floor's rooms. */
  addedRooms: { id: string; name: string; category: 'stairs'; coords: Point }[];
  /** Interior open-space grid, for tests and debugging. */
  grid: { w: number; h: number; cellPx: number; open: Uint8Array };
}

/** Separable square erosion (all dark in a k-window) or dilation (any dark), in place on a copy. */
function morph(src: Uint8Array, w: number, h: number, k: number, erode: boolean): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  // Erode uses the window [x, x+k-1]; dilate uses [x-k+1, x], so erode-then-dilate keeps positions.
  for (let y = 0; y < h; y++) {
    let run = 0;
    if (erode) {
      for (let x = w - 1; x >= 0; x--) { run = src[y * w + x] ? run + 1 : 0; tmp[y * w + x] = run >= k ? 1 : 0; }
    } else {
      for (let x = 0; x < w; x++) { run = src[y * w + x] ? k : Math.max(0, run - 1); tmp[y * w + x] = run > 0 ? 1 : 0; }
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    if (erode) {
      for (let y = h - 1; y >= 0; y--) { run = tmp[y * w + x] ? run + 1 : 0; out[y * w + x] = run >= k ? 1 : 0; }
    } else {
      for (let y = 0; y < h; y++) { run = tmp[y * w + x] ? k : Math.max(0, run - 1); out[y * w + x] = run > 0 ? 1 : 0; }
    }
  }
  return out;
}

/** Cells within r (chessboard distance) of a set cell. */
function dilateR(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // Window [x-r, x+r]: shift a k=2r+1 trailing dilation left by r.
  const k = 2 * r + 1;
  const d = morph(src, w, h, k, false);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(w - 1, x + r), sy = Math.min(h - 1, y + r);
    out[y * w + x] = d[sy * w + sx];
  }
  return out;
}

/** Zhang-Suen thinning of the set cells to one-cell-wide centre-lines. */
function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const m = src.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  let changed = true;
  const del: number[] = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = p.reduce((s, v) => s + v, 0);
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
        if (a !== 1) continue;
        if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        del.push(y * w + x);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

/** Every cell on the straight line a-b is open. */
function clearLine(open: Uint8Array, w: number, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
    if (!open[y * w + x]) return false;
  }
  return true;
}

/**
 * gray: one byte per image pixel (0 black .. 255 white), row-major. Rooms are in image percent.
 */
export function buildPlanGraph(
  gray: Uint8Array, imgW: number, imgH: number,
  rooms: { id: string; coords: Point; category?: string }[], idPrefix: string, opts: PlanGraphOptions = {},
): PlanGraph {
  const thinPx = opts.thinPx ?? 4, cell = opts.cellPx ?? 4, closeR = opts.outsideCloseCells ?? 12;
  const step = opts.stepCells ?? 6, linkR = opts.roomLinkCells ?? 40, straightPx = opts.straightPx ?? 30;
  const doorCloseCells = opts.doorCloseCells ?? 5, roomCost = opts.roomCost ?? 4;

  // 1. Walls: thick dark lines, plus thin ones that run straight for straightPx. Door arcs, door
  // leaves and text are thin and short or curved, so doorways stay open.
  const dark = new Uint8Array(imgW * imgH);
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < 128 ? 1 : 0;
  const walls = morph(morph(dark, imgW, imgH, thinPx, true), imgW, imgH, thinPx, false);
  const band = morph(dark, imgW, imgH, 3, false); // 1 px slack so jagged diagonal lines still count as straight
  // Horizontal and vertical runs first (most walls), in linear time. band is a trailing-window
  // dilation, shifted one pixel, so pixel (x, y) reads band at (x+1, y+1).
  const B = (x: number, y: number) => (x < 0 || y < 0 || x >= imgW || y >= imgH ? 0 : band[y * imgW + x]);
  const runH = new Uint16Array(imgW * imgH), runV = new Uint16Array(imgW * imgH);
  for (let y = 0; y < imgH; y++) {
    let s = 0;
    for (let x = 0; x <= imgW; x++) {
      if (x < imgW && B(x + 1, y + 1)) continue;
      for (let k = s; k < x; k++) runH[y * imgW + k] = Math.min(65535, x - s);
      s = x + 1;
    }
  }
  for (let x = 0; x < imgW; x++) {
    let s = 0;
    for (let y = 0; y <= imgH; y++) {
      if (y < imgH && B(x + 1, y + 1)) continue;
      for (let k = s; k < y; k++) runV[k * imgW + x] = Math.min(65535, y - s);
      s = y + 1;
    }
  }
  const half = straightPx >> 1;
  const dirs: number[] = [];
  for (let k = 1; k < 16; k++) if (k !== 8) dirs.push(Math.cos((k * Math.PI) / 16), Math.sin((k * Math.PI) / 16));
  for (let y = 0; y < imgH; y++) for (let x = 0; x < imgW; x++) {
    const i = y * imgW + x;
    if (!dark[i] || walls[i]) continue;
    if (runH[i] >= straightPx || runV[i] >= straightPx) { walls[i] = 1; continue; }
    for (let d = 0; d < dirs.length; d += 2) {
      const dx = dirs[d], dy = dirs[d + 1];
      let n = 1;
      for (let t = 1; t <= half && B(Math.round(x + t * dx) + 1, Math.round(y + t * dy) + 1); t++) n++;
      for (let t = 1; t <= half && B(Math.round(x - t * dx) + 1, Math.round(y - t * dy) + 1); t++) n++;
      if (n >= straightPx) { walls[i] = 1; break; }
    }
  }

  // 2. Grid: a cell is blocked if any wall pixel falls in it.
  const w = Math.ceil(imgW / cell), h = Math.ceil(imgH / cell);
  const blocked = new Uint8Array(w * h);
  for (let y = 0; y < imgH; y++) for (let x = 0; x < imgW; x++) if (walls[y * imgW + x]) blocked[((y / cell) | 0) * w + ((x / cell) | 0)] = 1;

  // 3. Outside: flood from the page edge with doorways closed, then take back the cells near it.
  const closed = dilateR(blocked, w, h, closeR);
  const outside = new Uint8Array(w * h);
  const queue: number[] = [];
  const seed = (i: number) => { if (!closed[i] && !outside[i]) { outside[i] = 1; queue.push(i); } };
  // Seed along the page edge and along lines 5% in, which sit inside a drawing's border frame.
  for (const fy of [0, Math.round(h * 0.05), Math.round(h * 0.95), h - 1]) for (let x = 0; x < w; x++) seed(fy * w + x);
  for (const fx of [0, Math.round(w * 0.05), Math.round(w * 0.95), w - 1]) for (let y = 0; y < h; y++) seed(y * w + fx);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
  }
  const outsideNear = dilateR(outside, w, h, closeR);
  const open = new Uint8Array(w * h);
  for (let i = 0; i < open.length; i++) open[i] = !blocked[i] && !outsideNear[i] ? 1 : 0;

  // 3b. Spaces with doorways closed; a space holding a non-corridor room label is "inside a room".
  const doorClosed = dilateR(blocked, w, h, doorCloseCells);
  const region = new Int32Array(w * h).fill(-1);
  let regions = 0;
  for (let s = 0; s < open.length; s++) {
    if (!open[s] || doorClosed[s] || region[s] >= 0) continue;
    const st = [s]; region[s] = regions;
    while (st.length) {
      const i = st.pop()!, x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < open.length && open[j] && !doorClosed[j] && region[j] < 0) { region[j] = regions; st.push(j); }
    }
    regions++;
  }
  const roomRegion = new Set<number>();
  for (const r of rooms) {
    if (r.category === 'corridor' || r.category === 'entrance' || r.category === 'exit') continue;
    const c = Math.floor((r.coords.y / 100) * imgH / cell) * w + Math.floor((r.coords.x / 100) * imgW / cell);
    if (region[c] >= 0) roomRegion.add(region[c]);
  }

  // 4. Centre-lines, traced into nodes every `step` cells and at every junction or end.
  const sk = thin(open, w, h);
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const nbrs = (i: number) => {
    const x = i % w, y = (i / w) | 0, out: number[] = [];
    for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) out.push(ny * w + nx); }
    return out;
  };
  const nodeAt = new Map<number, number>(); // skeleton cell -> node index
  const nodes: { cell: number; links: Set<number> }[] = [];
  const node = (c: number) => { let n = nodeAt.get(c); if (n === undefined) { n = nodes.length; nodes.push({ cell: c, links: new Set() }); nodeAt.set(c, n); } return n; };
  const link = (a: number, b: number) => { if (a !== b) { nodes[a].links.add(b); nodes[b].links.add(a); } };
  const seenEdge = new Set<string>();
  const walk = (from: number, first: number) => {
    let prevNode = node(from), prev = from, cur = first, count = 1;
    while (true) {
      const key = prev < cur ? `${prev}-${cur}` : `${cur}-${prev}`;
      if (seenEdge.has(key)) return;
      seenEdge.add(key);
      const ns = nbrs(cur);
      if (ns.length !== 2 || nodeAt.has(cur)) { const n = node(cur); link(prevNode, n); return; }
      if (count >= step) { const n = node(cur); link(prevNode, n); prevNode = n; count = 0; }
      const next = ns[0] === prev ? ns[1] : ns[0];
      prev = cur; cur = next; count++;
    }
  };
  for (let i = 0; i < sk.length; i++) if (sk[i] && nbrs(i).length !== 2) node(i);
  for (const n of [...nodeAt.keys()]) for (const m of nbrs(n)) walk(n, m);
  // Closed loops with no junction.
  for (let i = 0; i < sk.length; i++) if (sk[i] && !nodeAt.has(i) && nbrs(i).length === 2) {
    const k = [...seenEdge].some((e) => e.startsWith(`${i}-`) || e.endsWith(`-${i}`));
    if (!k) { node(i); for (const m of nbrs(i)) walk(i, m); }
  }

  // 5. Each room joins the nearest node it can see without crossing a wall.
  const roomLinks = new Map<number, string[]>();
  const linked: string[] = [], unlinked: string[] = [];
  for (const r of rooms) {
    const rx = Math.min(w - 1, Math.max(0, Math.floor((r.coords.x / 100) * imgW / cell)));
    const ry = Math.min(h - 1, Math.max(0, Math.floor((r.coords.y / 100) * imgH / cell)));
    let best = -1, bestD = linkR * linkR;
    if (open[ry * w + rx]) for (let n = 0; n < nodes.length; n++) {
      const c = nodes[n].cell, dx = (c % w) - rx, dy = ((c / w) | 0) - ry, d = dx * dx + dy * dy;
      if (d < bestD && clearLine(open, w, rx, ry, c % w, (c / w) | 0)) { best = n; bestD = d; }
    }
    if (best < 0) { unlinked.push(r.id); continue; }
    roomLinks.set(best, [...(roomLinks.get(best) || []), r.id]);
    linked.push(r.id);
  }

  // 6. Keep only the parts of the network that reach a room (drops the key map, title block, etc.).
  const keep = new Uint8Array(nodes.length);
  for (const start of roomLinks.keys()) {
    if (keep[start]) continue;
    const st = [start]; keep[start] = 1;
    while (st.length) for (const m of nodes[st.pop()!].links) if (!keep[m]) { keep[m] = 1; st.push(m); }
  }

  // 7. Stairs found on the drawing become rooms, joined at an open point by the flight (treads are
  // often drawn as walls), unless the floor already has a stairs room there. Only stairs that reach
  // the kept network count: a false find in the key map or legend is dropped.
  const addedRooms: { id: string; name: string; category: 'stairs'; coords: Point }[] = [];
  const C = (px: number, py: number) => [Math.min(w - 1, Math.max(0, Math.floor(px / cell))), Math.min(h - 1, Math.max(0, Math.floor(py / cell)))];
  (opts.stairs || []).forEach((b, i) => {
    const pad = 4 * cell;
    if (rooms.some((r) => r.category === 'stairs' && r.coords.x / 100 * imgW >= b.x0 - pad && r.coords.x / 100 * imgW <= b.x1 + pad && r.coords.y / 100 * imgH >= b.y0 - pad && r.coords.y / 100 * imgH <= b.y1 + pad)) return;
    const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, o = 3 * cell;
    for (const [px, py] of [[mx, my], [mx, b.y0 - o], [mx, b.y1 + o], [b.x0 - o, my], [b.x1 + o, my]]) {
      const [cx, cy] = C(px, py);
      if (!open[cy * w + cx]) continue;
      let best = -1, bestD = linkR * linkR;
      for (let n = 0; n < nodes.length; n++) {
        if (!keep[n]) continue;
        const c = nodes[n].cell, dx = (c % w) - cx, dy = ((c / w) | 0) - cy, d = dx * dx + dy * dy;
        if (d < bestD && clearLine(open, w, cx, cy, c % w, (c / w) | 0)) { best = n; bestD = d; }
      }
      if (best < 0) continue;
      const room = { id: `${idPrefix}-st${i + 1}`, name: 'Stairs', category: 'stairs' as const, coords: { x: +(((cx + 0.5) * cell) / imgW * 100).toFixed(2), y: +(((cy + 0.5) * cell) / imgH * 100).toFixed(2) } };
      roomLinks.set(best, [...(roomLinks.get(best) || []), room.id]);
      addedRooms.push(room);
      return;
    }
  });
  const id = (n: number) => `n${n}`; // unique within the floor; room ids carry the floor prefix
  const pct = (c: number, axis: 'x' | 'y') => +((((axis === 'x' ? c % w : (c / w) | 0) + 0.5) * cell) / (axis === 'x' ? imgW : imgH) * 100).toFixed(2);
  const hallways: CorridorNode[] = [];
  for (let n = 0; n < nodes.length; n++) if (keep[n]) hallways.push({
    id: id(n),
    coords: { x: pct(nodes[n].cell, 'x'), y: pct(nodes[n].cell, 'y') },
    ...(roomRegion.has(region[nodes[n].cell]) ? { cost: roomCost } : {}),
    connectedTo: [...[...nodes[n].links].filter((m) => keep[m]).map(id), ...(roomLinks.get(n) || [])],
  });
  return { hallways, linkedRoomIds: linked, unlinkedRoomIds: unlinked, addedRooms, grid: { w, h, cellPx: cell, open } };
}

/**
 * Stairs on a drawing: a flight is a stack of at least `minTreads` short parallel lines (treads)
 * at a steady small spacing. Returns boxes in image pixels. Horizontal and vertical flights only.
 */
export function detectStairs(gray: Uint8Array, imgW: number, imgH: number, opts: { minLen?: number; maxLen?: number; minGap?: number; maxGap?: number; minTreads?: number } = {}): { x0: number; y0: number; x1: number; y1: number }[] {
  const minLen = opts.minLen ?? 12, maxLen = opts.maxLen ?? 90, minGap = opts.minGap ?? 3, maxGap = opts.maxGap ?? 16, minTreads = opts.minTreads ?? 6;
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const vertical of [false, true]) {
    // Runs along rows (horizontal treads) or along columns (vertical treads); a = along, b = across.
    const A = vertical ? imgH : imgW, Bn = vertical ? imgW : imgH;
    const dark = (a: number, b: number) => gray[vertical ? a * imgW + b : b * imgW + a] < 200; // thin tread lines are often anti-aliased grey
    const black = (a: number, b: number) => gray[vertical ? a * imgW + b : b * imgW + a] < 128;
    const runs: { b: number; a0: number; a1: number }[][] = [];
    for (let b = 0; b < Bn; b++) {
      const row: { b: number; a0: number; a1: number }[] = [];
      let s = -1;
      for (let a = 0; a <= A; a++) {
        const d = a < A && dark(a, b);
        if (d && s < 0) s = a;
        if (!d && s >= 0) { const L = a - s; if (L >= minLen && L <= maxLen) row.push({ b, a0: s, a1: a }); s = -1; }
      }
      runs.push(row);
    }
    // A thick line shows as several adjacent runs: keep the first of each touching group.
    const used = new Set<string>();
    for (let b = 0; b < Bn; b++) for (const r of runs[b]) {
      if (used.has(`${b}:${r.a0}`)) continue;
      const chain = [r];
      let cur = r;
      while (true) {
        let next: typeof r | null = null;
        for (let g = minGap; g <= maxGap && !next; g++) {
          const nb = cur.b + g;
          if (nb >= Bn) break;
          next = runs[nb].find((q) => Math.min(q.a1, cur.a1) - Math.max(q.a0, cur.a0) >= 0.7 * Math.min(q.a1 - q.a0, cur.a1 - cur.a0) && Math.abs((q.a1 - q.a0) - (cur.a1 - cur.a0)) <= 0.3 * (cur.a1 - cur.a0)) || null;
        }
        if (!next) break;
        // skip the rest of this thick line's rows
        chain.push(next); cur = next;
      }
      const gaps = chain.slice(1).map((c, i) => c.b - chain[i].b);
      const steady = gaps.length && Math.max(...gaps) - Math.min(...gaps) <= 4;
      // Treads have white space between them; a solid black block (column, scale bar) does not.
      const openPairs = chain.slice(1).filter((c, i) => {
        const mb = Math.round((c.b + chain[i].b) / 2);
        let d = 0; for (let a = c.a0; a < c.a1; a++) if (black(a, mb)) d++;
        return d <= 0.3 * (c.a1 - c.a0);
      }).length;
      // An arrow or label crossing the flight closes a gap or two; most gaps must be open.
      if (openPairs < 0.75 * (chain.length - 1)) continue;
      if (chain.length >= minTreads && steady) {
        for (const c of chain) used.add(`${c.b}:${c.a0}`);
        const a0 = Math.min(...chain.map((c) => c.a0)), a1 = Math.max(...chain.map((c) => c.a1)), b0 = chain[0].b, b1 = chain[chain.length - 1].b;
        out.push(vertical ? { x0: b0, y0: a0, x1: b1, y1: a1 } : { x0: a0, y0: b0, x1: a1, y1: b1 });
      }
    }
  }
  // Merge overlapping boxes (two flights of one stair, or the same flight found twice).
  const merged: typeof out = [];
  for (const b of out) {
    const m = merged.find((o) => b.x0 <= o.x1 + 10 && b.x1 >= o.x0 - 10 && b.y0 <= o.y1 + 10 && b.y1 >= o.y0 - 10);
    if (m) { m.x0 = Math.min(m.x0, b.x0); m.y0 = Math.min(m.y0, b.y0); m.x1 = Math.max(m.x1, b.x1); m.y1 = Math.max(m.y1, b.y1); } else merged.push({ ...b });
  }
  return merged;
}
