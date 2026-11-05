import type { Building, EdgeKind, Floor, MapEdge, MapNode, PlaceCategory, RoomShape } from './types';
import {
  CATEGORIES,
  FLOOR_PLAN_SCHEMA,
  floorPlanPrompt,
  geminiJson,
  parseJsonText,
  splitDataUrl,
  type FloorNavPlan,
} from '../shared/gemini';

/**
 * Floor plan import pipeline:
 *   1. An image (upload or camera) is analysed by Gemini, either through the
 *      InsideOut server (key kept server-side) or directly with a key the
 *      user pastes. Gemini returns a FloorNav-format plan.
 *   2. `parseDraft` / `floorNavToDraft` validate it into a reviewable draft.
 *   3. A person reviews the draft (accept / reject / rename, link stairs and
 *      elevators to shafts on other floors).
 *   4. `draftToFloor` turns the verified draft into a routable floor.
 * Nothing from the AI reaches the live map without step 3.
 *
 * Draft coordinates are normalised to 0-1000 in both axes.
 */

export interface DraftRoom {
  id: string;
  label: string;
  /** Bounding box (normalised 0-1000). */
  x: number;
  y: number;
  width: number;
  height: number;
  accepted: boolean;
  category?: PlaceCategory;
  description?: string;
  /** Door / entry point; defaults to the centre of the box. */
  anchor?: [number, number];
  /** Corridor points this room's door connects to (from the AI's hallway graph). */
  linkTo?: Array<[number, number]>;
}

export interface DraftWalkway {
  id: string;
  points: Array<[number, number]>;
  accepted: boolean;
}

export interface DraftConnector {
  id: string;
  kind: 'stairs' | 'elevator';
  label: string;
  x: number;
  y: number;
  accepted: boolean;
  /** Existing shaft on another floor this connects to, if any. */
  linkShaftId?: string;
  linkTo?: Array<[number, number]>;
}

export interface FloorPlanDraft {
  title?: string;
  summary?: string;
  rooms: DraftRoom[];
  walkways: DraftWalkway[];
  connectors: DraftConnector[];
}

const clamp = (v: number) => Math.min(1000, Math.max(0, v));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function point(p: unknown): [number, number] | null {
  if (Array.isArray(p) && p.length >= 2) {
    const x = num(p[0]);
    const y = num(p[1]);
    return x === null || y === null ? null : [clamp(x), clamp(y)];
  }
  return null;
}

function category(v: unknown): PlaceCategory | undefined {
  const s = str(v)?.toLowerCase();
  return s && (CATEGORIES as readonly string[]).includes(s) ? (s as PlaceCategory) : s ? 'other' : undefined;
}

/**
 * Converts a FloorNav-format plan (percentage coordinates, hallway graph) into
 * a reviewable draft. Hallway-to-hallway links become corridor segments;
 * hallway-to-room links become door connections; elevator and stairs rooms
 * become connectors.
 */
export function floorNavToDraft(plan: FloorNavPlan): FloorPlanDraft {
  const pct = (p: unknown): [number, number] | null => {
    const o = p as { x?: unknown; y?: unknown } | null;
    const x = num(o?.x);
    const y = num(o?.y);
    return x === null || y === null ? null : [clamp(x * 10), clamp(y * 10)];
  };
  const rawRooms = Array.isArray(plan?.rooms) ? plan.rooms : [];
  const rawHalls = Array.isArray(plan?.hallways) ? plan.hallways : [];

  const hall = new Map<string, [number, number]>();
  for (const h of rawHalls) {
    const p = pct(h?.coords);
    if (p && str(h?.id)) hall.set(h.id, p);
  }
  const roomIds = new Set(rawRooms.map((r) => r?.id).filter(Boolean));

  // Room id -> corridor points that list it in connectedTo.
  const doorLinks = new Map<string, Array<[number, number]>>();
  const walkways: DraftWalkway[] = [];
  const seen = new Set<string>();
  for (const h of rawHalls) {
    const a = hall.get(h?.id);
    if (!a || !Array.isArray(h.connectedTo)) continue;
    for (const target of h.connectedTo) {
      const b = hall.get(target);
      if (b) {
        const key = [h.id, target].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        walkways.push({ id: `walk-${walkways.length}`, points: [a, b], accepted: true });
      } else if (roomIds.has(target)) {
        const list = doorLinks.get(target) ?? [];
        list.push(a);
        doorLinks.set(target, list);
      }
    }
  }
  // A hallway node with no hallway neighbours still needs to exist as a corridor point.
  for (const [id, p] of hall) {
    if (!walkways.some((w) => w.points.includes(p))) {
      walkways.push({ id: `walk-${walkways.length}-${id}`, points: [p, p], accepted: true });
    }
  }

  const rooms: DraftRoom[] = [];
  const connectors: DraftConnector[] = [];
  rawRooms.forEach((r, i) => {
    const anchor = pct(r?.coords);
    if (!anchor) return;
    const name = str(r.name) ?? str(r.roomNumber) ?? `Room ${i + 1}`;
    const cat = category(r.category);
    const linkTo = doorLinks.get(r.id);
    if (cat === 'elevator' || cat === 'stairs') {
      connectors.push({ id: `${cat}-${i}`, kind: cat, label: name, x: anchor[0], y: anchor[1], accepted: true, linkTo });
      return;
    }
    const b = r.bounds;
    const bx = num(b?.x), by = num(b?.y), bw = num(b?.width), bh = num(b?.height);
    const box =
      bx !== null && by !== null && bw !== null && bh !== null && bw > 0 && bh > 0
        ? { x: clamp(bx * 10), y: clamp(by * 10), width: Math.min(bw * 10, 1000 - clamp(bx * 10)), height: Math.min(bh * 10, 1000 - clamp(by * 10)) }
        : { x: clamp(anchor[0] - 30), y: clamp(anchor[1] - 30), width: 60, height: 60 };
    const number = str(r.roomNumber)?.match(/^\d+[A-Za-z]?/)?.[0];
    rooms.push({
      id: `room-${i}`,
      label: number && !name.includes(number) ? `${name} (${number})` : name,
      ...box,
      accepted: true,
      category: cat,
      description: str(r.description),
      anchor,
      linkTo,
    });
  });

  if (rooms.length === 0 && walkways.length === 0) {
    throw new Error('No rooms or corridors were detected. Try a clearer floor plan image.');
  }
  return { title: str(plan.title), summary: str(plan.summary), rooms, walkways, connectors };
}

/**
 * Validates AI output. Accepts the FloorNav format (rooms + hallways) and the
 * simpler InsideOut format (rooms + walkways + stairs + elevators).
 */
export function parseDraft(text: string): FloorPlanDraft {
  const raw = parseJsonText<Record<string, unknown>>(text);
  if (Array.isArray(raw?.hallways)) return floorNavToDraft(raw as unknown as FloorNavPlan);
  const arr = (k: string): unknown[] => (Array.isArray(raw?.[k]) ? (raw[k] as unknown[]) : []);

  const rooms: DraftRoom[] = [];
  arr('rooms').forEach((r, i) => {
    const o = r as Record<string, unknown>;
    const x = num(o?.x), y = num(o?.y), w = num(o?.width), h = num(o?.height);
    if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return;
    rooms.push({
      id: `room-${i}`,
      label: str(o.label) ?? `Room ${i + 1}`,
      x: clamp(x),
      y: clamp(y),
      width: Math.min(w, 1000 - clamp(x)),
      height: Math.min(h, 1000 - clamp(y)),
      accepted: true,
      category: category(o.category),
    });
  });

  const walkways: DraftWalkway[] = [];
  arr('walkways').forEach((w, i) => {
    const pts = Array.isArray((w as Record<string, unknown>)?.points)
      ? ((w as Record<string, unknown>).points as unknown[]).map(point).filter((p): p is [number, number] => p !== null)
      : [];
    if (pts.length >= 2) walkways.push({ id: `walk-${i}`, points: pts, accepted: true });
  });

  const connectors: DraftConnector[] = [];
  for (const kind of ['stairs', 'elevator'] as const) {
    arr(kind === 'stairs' ? 'stairs' : 'elevators').forEach((c, i) => {
      const o = c as Record<string, unknown>;
      const x = num(o?.x), y = num(o?.y);
      if (x === null || y === null) return;
      connectors.push({
        id: `${kind}-${i}`,
        kind,
        label: str(o.label) ?? (kind === 'stairs' ? `Stairs ${i + 1}` : `Elevator ${i + 1}`),
        x: clamp(x),
        y: clamp(y),
        accepted: true,
      });
    });
  }

  if (rooms.length === 0 && walkways.length === 0) {
    throw new Error('No rooms or walkways were detected. Try a clearer floor plan image.');
  }
  return { rooms, walkways, connectors };
}

export interface DraftToFloorOptions {
  floorName: string;
  level: number;
  /** Real-world width of the plan in metres; height is scaled by aspect ratio. */
  widthMetres: number;
  aspectRatio: number; // image height / width
  imageUrl?: string;
  floorId?: string;
}

/** Distance (in metres) within which walkway points are merged into one junction. */
const MERGE_DISTANCE = 1.5;

/**
 * Converts a human-verified draft into a floor plus nodes and edges.
 * Rejected items are ignored. Rooms connect to the corridor points the AI
 * linked them to, or otherwise to the nearest corridor point. Connectors with
 * `linkShaftId` are joined to that shaft on the nearest existing floor.
 */
export function draftToFloor(
  draft: FloorPlanDraft,
  building: Building,
  opts: DraftToFloorOptions,
): { floor: Floor; nodes: MapNode[]; edges: MapEdge[] } {
  const floorId = opts.floorId ?? `f-import-${Date.now().toString(36)}`;
  const width = opts.widthMetres;
  const height = width * opts.aspectRatio;
  const sx = (v: number) => (v / 1000) * width;
  const sy = (v: number) => (v / 1000) * height;

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const rooms: RoomShape[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (from: string, to: string, kind: EdgeKind = 'walkway') => {
    if (from === to) return;
    const key = [from, to].sort().join('|');
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: `${from}__${to}`, from, to, kind });
  };

  const corridor: MapNode[] = [];
  const nodeAt = (x: number, y: number): MapNode => {
    const near = corridor.find((n) => Math.hypot(n.x - x, n.y - y) <= MERGE_DISTANCE);
    if (near) return near;
    const n: MapNode = { id: `${floorId}-c${corridor.length}`, floorId, kind: 'corridor', x, y };
    corridor.push(n);
    return n;
  };
  for (const w of draft.walkways.filter((w) => w.accepted)) {
    let prev: MapNode | null = null;
    for (const [px, py] of w.points) {
      const n = nodeAt(sx(px), sy(py));
      if (prev) addEdge(prev.id, n.id);
      prev = n;
    }
  }
  splitTJunctions(corridor, edges, edgeKeys);
  nodes.push(...corridor);

  const nearestCorridor = (x: number, y: number): MapNode | undefined => {
    let best: MapNode | undefined;
    let bestD = Infinity;
    for (const n of corridor) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };
  const linkPlace = (node: MapNode, linkTo?: Array<[number, number]>) => {
    const targets = (linkTo ?? []).map(([x, y]) => nearestCorridor(sx(x), sy(y))).filter((n): n is MapNode => !!n);
    if (targets.length === 0) {
      const c = nearestCorridor(node.x, node.y);
      if (c) targets.push(c);
    }
    for (const t of targets) addEdge(t.id, node.id);
  };

  draft.rooms.filter((r) => r.accepted).forEach((r, i) => {
    const x0 = sx(r.x), y0 = sy(r.y), x1 = sx(r.x + r.width), y1 = sy(r.y + r.height);
    const node: MapNode = {
      id: `${floorId}-r${i}`,
      floorId,
      kind: r.category === 'entrance' ? 'entrance' : 'room',
      x: r.anchor ? sx(r.anchor[0]) : (x0 + x1) / 2,
      y: r.anchor ? sy(r.anchor[1]) : (y0 + y1) / 2,
      label: r.label,
      aliases: roomAliases(r.label),
      category: r.category,
      description: r.description,
    };
    nodes.push(node);
    rooms.push({ nodeId: node.id, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
    linkPlace(node, r.linkTo);
  });

  const otherFloors = building.floors
    .filter((f) => f.level !== opts.level)
    .sort((a, b) => Math.abs(a.level - opts.level) - Math.abs(b.level - opts.level));

  draft.connectors.filter((c) => c.accepted).forEach((c, i) => {
    const node: MapNode = {
      id: `${floorId}-${c.kind}${i}`,
      floorId,
      kind: c.kind,
      x: sx(c.x),
      y: sy(c.y),
      label: `${c.label} (${opts.floorName})`,
      aliases: [c.kind],
      category: c.kind,
      shaftId: c.linkShaftId ?? `${floorId}-${c.kind}${i}-shaft`,
    };
    nodes.push(node);
    linkPlace(node, c.linkTo);
    if (c.linkShaftId) {
      for (const f of otherFloors) {
        const target = building.nodes.find((n) => n.floorId === f.id && n.shaftId === c.linkShaftId);
        if (target) {
          addEdge(target.id, node.id, c.kind);
          break;
        }
      }
    }
  });

  return {
    floor: { id: floorId, name: opts.floorName, level: opts.level, width, height, rooms, imageUrl: opts.imageUrl },
    nodes,
    edges,
  };
}

/**
 * Where a walkway ends on the middle of another walkway's segment (a T
 * junction), split that segment at the endpoint so the two are connected.
 */
function splitTJunctions(corridor: MapNode[], edges: MapEdge[], edgeKeys: Set<string>): void {
  const byId = new Map(corridor.map((n) => [n.id, n]));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (const n of corridor) {
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.from === n.id || e.to === n.id) continue;
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = ((n.x - a.x) * dx + (n.y - a.y) * dy) / len2;
        if (t <= 0 || t >= 1) continue;
        const d = Math.hypot(a.x + t * dx - n.x, a.y + t * dy - n.y);
        if (d > MERGE_DISTANCE) continue;
        edges.splice(i, 1);
        edgeKeys.delete([a.id, b.id].sort().join('|'));
        for (const [p, q] of [[a.id, n.id], [n.id, b.id]]) {
          const key = [p, q].sort().join('|');
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            edges.push({ id: `${p}__${q}`, from: p, to: q, kind: 'walkway' });
          }
        }
        changed = true;
        break outer;
      }
    }
  }
}

function roomAliases(label: string): string[] {
  const m = label.match(/\d+[A-Za-z]?/);
  return m ? [m[0]] : [];
}

/** Lists the distinct vertical shafts in a building, for linking imports. */
export function listShafts(building: Building, kind: 'stairs' | 'elevator'): Array<{ shaftId: string; label: string }> {
  const seen = new Map<string, string>();
  for (const n of building.nodes) {
    if (n.kind === kind && n.shaftId && !seen.has(n.shaftId)) {
      seen.set(n.shaftId, (n.label ?? n.shaftId).replace(/\s*\(.*\)$/, ''));
    }
  }
  return [...seen].map(([shaftId, label]) => ({ shaftId, label }));
}

export interface AnalyseOptions {
  /** Gemini key pasted in the browser. If absent, the InsideOut server is used. */
  apiKey?: string;
  model?: string;
  buildingTypeHint?: string;
  fetchImpl?: typeof fetch;
}

/** Sends a floor plan image (data URL) to Gemini and returns a draft for review. */
export async function analyseFloorPlan(imageDataUrl: string, opts: AnalyseOptions = {}): Promise<FloorPlanDraft> {
  const doFetch = opts.fetchImpl ?? fetch;
  if (opts.apiKey) {
    const { mimeType, data } = splitDataUrl(imageDataUrl);
    const plan = await geminiJson<FloorNavPlan>({
      apiKey: opts.apiKey,
      model: opts.model,
      parts: [{ inline_data: { mime_type: mimeType, data } }, { text: floorPlanPrompt(opts.buildingTypeHint) }],
      schema: FLOOR_PLAN_SCHEMA,
      fetchImpl: doFetch,
    });
    return floorNavToDraft(plan);
  }
  const res = await doFetch('/api/analyze-floorplan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, buildingTypeHint: opts.buildingTypeHint }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Floor plan analysis failed (${res.status}).`);
  return floorNavToDraft(body as FloorNavPlan);
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/** A ready-made AI result (FloorNav format) so review can be tried without a key. */
export const SAMPLE_DRAFT_JSON = JSON.stringify({
  title: 'Sample Wing',
  summary: 'A single east-west corridor with offices to the north and seminar rooms to the south.',
  rooms: [
    { id: 'r401', name: 'Room 401', category: 'office', coords: { x: 17.5, y: 30 }, bounds: { x: 5, y: 5, width: 25, height: 25 } },
    { id: 'r402', name: 'Room 402', category: 'classroom', coords: { x: 50, y: 30 }, bounds: { x: 35, y: 5, width: 30, height: 25 } },
    { id: 'r403', name: 'Room 403', category: 'office', coords: { x: 82.5, y: 30 }, bounds: { x: 70, y: 5, width: 25, height: 25 } },
    { id: 'r404', name: 'Seminar Room 404', category: 'conference', coords: { x: 25, y: 70 }, bounds: { x: 5, y: 70, width: 40, height: 25 } },
    { id: 'r405', name: 'Office 405', category: 'office', coords: { x: 75, y: 70 }, bounds: { x: 55, y: 70, width: 40, height: 25 } },
    { id: 'wc4', name: 'Washrooms', category: 'restroom', coords: { x: 62, y: 56 }, bounds: { x: 58, y: 54, width: 8, height: 12 } },
    { id: 'st-w', name: 'West Stairs', category: 'stairs', coords: { x: 2.5, y: 50 } },
    { id: 'st-e', name: 'East Stairs', category: 'stairs', coords: { x: 97.5, y: 50 } },
    { id: 'el', name: 'Elevator', category: 'elevator', coords: { x: 56, y: 56 } },
  ],
  hallways: [
    { id: 'h1', coords: { x: 3, y: 50 }, connectedTo: ['h2', 'st-w'] },
    { id: 'h2', coords: { x: 17.5, y: 50 }, connectedTo: ['h1', 'h3', 'r401'] },
    { id: 'h3', coords: { x: 25, y: 50 }, connectedTo: ['h2', 'h4', 'r404'] },
    { id: 'h4', coords: { x: 50, y: 50 }, connectedTo: ['h3', 'h5', 'r402'] },
    { id: 'h5', coords: { x: 60, y: 50 }, connectedTo: ['h4', 'h6', 'el', 'wc4'] },
    { id: 'h6', coords: { x: 75, y: 50 }, connectedTo: ['h5', 'h7', 'r405'] },
    { id: 'h7', coords: { x: 82.5, y: 50 }, connectedTo: ['h6', 'h8', 'r403'] },
    { id: 'h8', coords: { x: 97, y: 50 }, connectedTo: ['h7', 'st-e'] },
  ],
});
