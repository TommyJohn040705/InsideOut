/**
 * Floor plans imported through the floor-plan studio. Shared by the server (which stores
 * them in data/store.json) and the app (which shows published ones on the campus map and
 * in the indoor navigator). Status is always derived from what the record actually holds.
 */
import type { CorridorNode, FloorPlanData, RoomPOI, VerticalCirculationLink } from '../types/navigation';
import { distanceM, fitGeoref, type ControlPoint, type Georef, type LngLat } from './georef';
import type { FloorStatus } from './campusData';

export interface FloorImport {
  id: string;
  /** Campus building id (src/data/campus/buildings.json), e.g. "DC". */
  buildingId: string;
  floorCode: string;
  floorNumber: number;
  /** Plant Operations manifest filename this file corresponds to, when known. */
  manifestFilename: string | null;
  restricted: boolean;
  /** Who said they may use the document, and on what basis (free text, required). */
  authorization: string;
  sourceName: string;
  sourceMime: string;
  /** Original upload, served by this app's server only. */
  fileUrl: string;
  /** Raster used for display and extraction (the PDF's first page for PDFs). */
  imageUrl: string;
  imageSize: [number, number];
  uploadedAt: string;
  /** Room labels read from the PDF's own text layer (no AI), in image percent. */
  pdfLabels: { text: string; x: number; y: number }[];
  extraction: null | { model: string; at: string; title?: string; summary?: string };
  rooms: RoomPOI[];
  hallways: CorridorNode[];
  controlPoints: ControlPoint[];
  /** Set when the control points were copied from another floor of the same drawing series. */
  alignmentFrom?: string;
  reviewed: boolean;
  reviewedAt?: string;
  published: boolean;
  /** Hallway network read automatically off the drawing (src/campus/planGraph.ts); used until hand-drawn hallways are reviewed. */
  autoHallways?: CorridorNode[];
  autoHallwaysAt?: string;
  /** Node count of the automatic network, which is stored in its own file (data/networks) and loaded on demand. */
  autoNodes?: number;
}

/** A hallway network in a compact form for storage: positions, costly nodes, edges by index, room links. */
export interface CompactNetwork { v: 1; xy: number[]; costly: number[]; cost: number; edges: number[]; rooms: Record<string, number[]> }

export function encodeNetwork(h: CorridorNode[]): CompactNetwork {
  const at = new Map(h.map((n, i) => [n.id, i]));
  const out: CompactNetwork = { v: 1, xy: [], costly: [], cost: 1, edges: [], rooms: {} };
  h.forEach((n, i) => {
    out.xy.push(+n.coords.x.toFixed(2), +n.coords.y.toFixed(2));
    if (n.cost && n.cost > 1) { out.costly.push(i); out.cost = n.cost; }
    for (const t of n.connectedTo) {
      const j = at.get(t);
      if (j === undefined) (out.rooms[t] ||= []).push(i);
      else if (j > i) out.edges.push(i, j);
    }
  });
  return out;
}

export function decodeNetwork(c: CompactNetwork): CorridorNode[] {
  const nodes: CorridorNode[] = [];
  for (let i = 0; i < c.xy.length / 2; i++) nodes.push({ id: `n${i}`, coords: { x: c.xy[2 * i], y: c.xy[2 * i + 1] }, connectedTo: [] });
  for (const i of c.costly) nodes[i].cost = c.cost;
  for (let k = 0; k < c.edges.length; k += 2) { nodes[c.edges[k]].connectedTo.push(`n${c.edges[k + 1]}`); nodes[c.edges[k + 1]].connectedTo.push(`n${c.edges[k]}`); }
  for (const [room, idx] of Object.entries(c.rooms)) for (const i of idx) nodes[i].connectedTo.push(room);
  return nodes;
}

/** Metres per 1% of image height from this floor's alignment, else from another aligned floor of the building. */
export function metresPerPctOf(f: FloorImport, sameBuilding: FloorImport[] = []): number | undefined {
  for (const x of [f, ...sameBuilding]) {
    const g = georefOfImport(x);
    if (g && x.imageSize[1] === f.imageSize[1]) return (g.metresPerPixel * x.imageSize[1]) / 100;
  }
  return undefined;
}

/** True when routing on this floor uses the automatic network, not reviewed hand-drawn hallways. */
export const usesAutoHallways = (f: FloorImport) => importStatus(f) !== 'routing_available' && !!(f.autoHallways?.length || f.autoNodes);

/** Problems that keep a floor's hallway graph from being used for routing. */
export function graphProblems(rooms: RoomPOI[], hallways: CorridorNode[]): string[] {
  const out: string[] = [];
  if (!hallways.length) return ['No hallway nodes.'];
  const ids = new Set(hallways.map((h) => h.id));
  const adj = new Map<string, Set<string>>(hallways.map((h) => [h.id, new Set<string>()]));
  for (const h of hallways) for (const t of h.connectedTo) if (ids.has(t)) { adj.get(h.id)!.add(t); adj.get(t)!.add(h.id); }
  const seen = new Set<string>([hallways[0].id]);
  const stack = [hallways[0].id];
  while (stack.length) for (const n of adj.get(stack.pop()!)!) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (seen.size < hallways.length) out.push(`${hallways.length - seen.size} hallway nodes are not connected to the rest.`);
  const linked = new Set(hallways.flatMap((h) => h.connectedTo));
  const loose = rooms.filter((r) => !linked.has(r.id));
  if (loose.length) out.push(`${loose.length} rooms have no hallway connection (${loose.slice(0, 4).map((r) => r.roomNumber || r.name).join(', ')}${loose.length > 4 ? ', ...' : ''}).`);
  return out;
}

export function georefOfImport(f: FloorImport): Georef | null {
  if (f.controlPoints.length < 2) return null;
  try {
    return fitGeoref({ buildingId: f.buildingId, floors: [f.floorNumber], imageSize: f.imageSize, method: 'control_points_studio', review: f.reviewed ? 'human_reviewed' : 'draft_unreviewed', controlPoints: f.controlPoints });
  } catch { return null; }
}

/** Highest stage this record has really reached. Never reports route_verified: nothing here is walked. */
export function importStatus(f: FloorImport): FloorStatus {
  if (!f.fileUrl) return 'source_found';
  if (!f.rooms.length) return 'imported';
  if (!georefOfImport(f)) return 'geometry_extracted';
  if (!f.reviewed) return 'georeferenced';
  // A connected corridor network makes the floor routable; rooms not linked to it are warned about, not blocking.
  return f.hallways.length && !graphProblems([], f.hallways).length ? 'routing_available' : 'human_reviewed';
}

/** Floor button label for a Plant Operations floor code: "01" -> "1", "02FLR_MEZ" -> "2M", "CON" -> "Con". */
export function floorLabelOf(code: string, filename = ''): string {
  if (/02FLR_MEZ/i.test(filename)) return '2M';
  if (/_0M_MEZ/i.test(filename)) return 'Mez';
  if (/_0B_CON/i.test(filename)) return 'Con';
  if (code === '00') return 'G';
  return /^\d+$/.test(code) ? String(Number(code)) : code;
}

export const importAppBuildingId = (buildingId: string) => `import-${buildingId}`;

/** A published import as a floor the indoor navigator can open and route on. */
export function importToPlan(f: FloorImport, buildingName: string, sameBuilding: FloorImport[] = []): FloorPlanData {
  return {
    id: `import-${f.id}`,
    title: `${buildingName}, floor ${floorLabelOf(f.floorCode, f.sourceName)}`,
    subTitle: `${buildingName} · Plant Operations plan ${f.sourceName}`,
    floorLabel: floorLabelOf(f.floorCode, f.sourceName),
    floorNumber: f.floorNumber,
    buildingId: importAppBuildingId(f.buildingId),
    buildingName,
    buildingType: 'University',
    summary: f.extraction?.summary || '',
    imageUrl: f.imageUrl,
    rooms: f.rooms.map((r) => ({ ...r, floor: f.floorNumber, buildingId: importAppBuildingId(f.buildingId) })),
    // Reviewed, connected hand-drawn hallways win; otherwise the network read off the drawing.
    hallways: importStatus(f) === 'routing_available' ? f.hallways : f.autoHallways || [],
    autoHallways: usesAutoHallways(f),
    aspect: f.imageSize[0] / f.imageSize[1],
    metresPerPct: metresPerPctOf(f, sameBuilding),
    source: 'upload',
  };
}

/** PDF text items that look like room numbers ("1302", "2108A", "DC 1302"). */
export const roomNumberLabels = (labels: FloorImport['pdfLabels']) => labels.filter((l) => /^([A-Z]{1,4}\s?)?\d{3,4}[A-Z]?$/.test(l.text));

/** Two shafts on different floors this close on the map (m) are the same shaft, if each is the other's nearest. */
export const SHAFT_MATCH_M = 3;

/**
 * Stairs and elevators of an imported building, matched across floors two ways: by room number
 * (Plant Operations repeats the number after the floor digit: 1817, 2817, 3817) and, when floors
 * are placed on the map (`locate`), by position: the same type of shaft within SHAFT_MATCH_M on
 * another floor, each the other's nearest. Only shafts joined to a hallway network become links.
 */
export function verticalLinksFor(plans: FloorPlanData[], locate?: (floor: number, p: { x: number; y: number }) => LngLat | null): VerticalCirculationLink[] {
  // "1093 ELV" -> "093": the number after the floor digit, ignoring any trailing label.
  const suffix = (r: RoomPOI) => (r.roomNumber || '').match(/^\d(\d{3}[A-Z]?)\b/)?.[1];
  // A shaft read as elevator/stairs on one floor carries to the same number on other floors where the
  // reader called it a corridor or service room (lobbies, unlabelled shafts), never an office or classroom.
  const shaftType = new Map<string, 'elevator' | 'stairs'>();
  for (const p of plans) for (const r of p.rooms) {
    const s = suffix(r);
    if (s && (r.category === 'elevator' || (r.category === 'stairs' && !shaftType.has(s)))) shaftType.set(s, r.category);
  }
  const MAY_BE_SHAFT = new Set(['elevator', 'stairs', 'corridor', 'utility', 'other']);
  type Shaft = { floor: number; roomId: string; corridorNodeId: string; type: 'elevator' | 'stairs'; number: string; key?: string; at: LngLat | null };
  const shafts: Shaft[] = [];
  for (const p of plans) {
    const corridorOf = new Map<string, string>();
    for (const h of p.hallways) for (const t of h.connectedTo) if (!corridorOf.has(t)) corridorOf.set(t, h.id);
    for (const r of p.rooms) {
      const s = suffix(r);
      const type = s && shaftType.has(s) && MAY_BE_SHAFT.has(r.category) ? shaftType.get(s)! : r.category === 'elevator' || r.category === 'stairs' ? r.category : undefined;
      const corridor = corridorOf.get(r.id);
      if (!type || !corridor) continue;
      shafts.push({ floor: p.floorNumber, roomId: r.id, corridorNodeId: corridor, type, number: r.roomNumber?.match(/^\d+[A-Z]?/)?.[0] || r.name, key: s && shaftType.has(s) ? `${type}:${s}` : undefined, at: locate ? locate(p.floorNumber, r.coords) : null });
    }
  }
  // Union-find over shafts: same number key, or mutual nearest same-type shaft on the map.
  const parent = shafts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const byKey = new Map<string, number>();
  shafts.forEach((s, i) => { if (s.key) { if (byKey.has(s.key)) union(i, byKey.get(s.key)!); else byKey.set(s.key, i); } });
  // Positions in local metres. Floors are aligned one by one, so a whole floor can sit a few metres
  // off its neighbour; estimate that shift per pair of floors from the shafts themselves first.
  const ref = shafts.find((s) => s.at)?.at;
  const xy = (s: Shaft): [number, number] | null => (s.at && ref ? [(s.at[0] - ref[0]) * 111320 * Math.cos((ref[1] * Math.PI) / 180), (s.at[1] - ref[1]) * 111320] : null);
  const P = shafts.map(xy);
  const floors = [...new Set(shafts.map((s) => s.floor))];
  const shiftBetween = (fa: number, fb: number): [number, number] | null => {
    const A = shafts.map((_, i) => i).filter((i) => shafts[i].floor === fa && P[i]), B = shafts.map((_, i) => i).filter((i) => shafts[i].floor === fb && P[i]);
    let best: [number, number] | null = null, bestN = 0;
    for (const i of A) for (const j of B) {
      if (shafts[i].type !== shafts[j].type) continue;
      const d: [number, number] = [P[j]![0] - P[i]![0], P[j]![1] - P[i]![1]];
      if (Math.hypot(d[0], d[1]) > 8) continue;
      const n = A.filter((a) => B.some((b) => shafts[a].type === shafts[b].type && Math.hypot(P[b]![0] - P[a]![0] - d[0], P[b]![1] - P[a]![1] - d[1]) <= 1.5)).length;
      if (n > bestN || (n === bestN && best && Math.hypot(...d) < Math.hypot(...best))) { best = d; bestN = n; }
    }
    // One shaft pair alone can't confirm a shift: accept it only if small.
    return best && (bestN >= 2 || Math.hypot(...best) <= 5) ? best : null;
  };
  for (const fa of floors) for (const fb of floors) {
    if (fa >= fb) continue;
    const d = shiftBetween(fa, fb);
    if (!d) continue;
    const near = (i: number, floor: number, sign: number) => {
      let best = -1, bestM = SHAFT_MATCH_M;
      shafts.forEach((t, j) => {
        if (t.floor !== floor || t.type !== shafts[i].type || !P[j]) return;
        const m = Math.hypot(P[j]![0] - P[i]![0] - sign * d[0], P[j]![1] - P[i]![1] - sign * d[1]);
        if (m <= bestM) { best = j; bestM = m; }
      });
      return best;
    };
    shafts.forEach((s, i) => { if (s.floor === fa && P[i]) { const j = near(i, fb, 1); if (j >= 0 && near(j, fa, -1) === i) union(i, j); } });
  }
  const groups = new Map<number, Shaft[]>();
  shafts.forEach((s, i) => { const l = groups.get(find(i)) || []; if (!l.some((x) => x.floor === s.floor)) l.push(s); groups.set(find(i), l); });
  return [...groups.values()].filter((l) => l.length >= 2).map((l) => {
    l.sort((a, b) => a.floor - b.floor);
    const byNumber = l.every((x) => x.key && x.key === l[0].key);
    return {
      id: `v-${l[0].type}-${l[0].roomId}`,
      type: l[0].type,
      name: `${l[0].type === 'elevator' ? 'Elevator' : 'Stairs'} ${l.map((x) => x.number).join('/')}`,
      floorsServed: l.map((x) => x.floor),
      accessible: l[0].type === 'elevator',
      nodes: l.map(({ floor, roomId, corridorNodeId }) => ({ floor, roomId, corridorNodeId })),
      description: byNumber ? 'Matched by room number across floors (Plant Operations numbering); not checked on site.'
        : `Matched across floors by room number and by position on the map (within ${SHAFT_MATCH_M} m); not checked on site.`,
    };
  });
}

/** Map position of a point on a building's imported floor, for matching shafts across floors. */
export const importLocator = (imports: FloorImport[]) => (floor: number, p: { x: number; y: number }): LngLat | null => {
  const f = imports.find((x) => x.floorNumber === floor);
  if (!f) return null;
  // An unaligned floor borrows the alignment of a sibling sheet of the same size (same drawing set);
  // the per-floor shift estimate in verticalLinksFor absorbs the difference.
  const g = georefOfImport(f) || imports.filter((x) => x.imageSize.join() === f.imageSize.join()).map(georefOfImport).find(Boolean);
  if (g) return g.pctToLngLat(p);
  // No alignment for this sheet size at all: compare in sheet coordinates, in a made-up frame per
  // sheet size placed far from campus, so these floors only ever match each other.
  // shortcut: assumes ~1 m per 1% of sheet height (typical Plant Operations scale); upgrade by aligning the floor.
  const sizes = [...new Set(imports.map((x) => x.imageSize.join()))].sort();
  const k = sizes.indexOf(f.imageSize.join());
  const mPerPct = metresPerPctOf(f, imports) || 1;
  const yM = p.y * mPerPct, xM = p.x * mPerPct * (f.imageSize[0] / f.imageSize[1]);
  return [10 * k + xM / 80000, yM / 111320];
};

/** The same alignment turned 180° about the control points' centre (fixes an upside-down automatic fit). */
export function turnedControlPoints(f: FloorImport): FloorImport['controlPoints'] {
  const g = georefOfImport(f);
  if (!g) return f.controlPoints;
  const cx = f.controlPoints.reduce((s, c) => s + c.px[0], 0) / f.controlPoints.length;
  const cy = f.controlPoints.reduce((s, c) => s + c.px[1], 0) / f.controlPoints.length;
  return f.controlPoints.map((c) => {
    const [lng, lat] = g.pxToLngLat([2 * cx - c.px[0], 2 * cy - c.px[1]]);
    return { ...c, lngLat: [+lng.toFixed(7), +lat.toFixed(7)] };
  });
}
