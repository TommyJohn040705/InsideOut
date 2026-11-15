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
  const id = (n: number) => `${idPrefix}-a${n}`;
  const pct = (c: number, axis: 'x' | 'y') => +((((axis === 'x' ? c % w : (c / w) | 0) + 0.5) * cell) / (axis === 'x' ? imgW : imgH) * 100).toFixed(2);
  const hallways: CorridorNode[] = [];
  for (let n = 0; n < nodes.length; n++) if (keep[n]) hallways.push({
    id: id(n),
    coords: { x: pct(nodes[n].cell, 'x'), y: pct(nodes[n].cell, 'y') },
    ...(roomRegion.has(region[nodes[n].cell]) ? { cost: roomCost } : {}),
    connectedTo: [...[...nodes[n].links].filter((m) => keep[m]).map(id), ...(roomLinks.get(n) || [])],
  });
  return { hallways, linkedRoomIds: linked, unlinkedRoomIds: unlinked, grid: { w, h, cellPx: cell, open } };
}
