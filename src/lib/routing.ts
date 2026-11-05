import type { Building, Maneuver, MapEdge, MapNode, Route, RouteOptions, RouteStep } from './types';

/** Fixed costs (in metre-equivalents) for vertical travel. */
export const STAIRS_COST_PER_LEVEL = 15;
export const ELEVATOR_BASE_COST = 20; // waiting for the car
export const ELEVATOR_COST_PER_LEVEL = 4;

export interface RouteRequest {
  fromId: string;
  toId: string;
  options: RouteOptions;
  blockedEdges?: Set<string>;
}

export type RouteResult =
  | { ok: true; route: Route }
  | { ok: false; reason: string };

interface Graph {
  nodes: Map<string, MapNode>;
  levels: Map<string, number>;
  adjacency: Map<string, Array<{ edge: MapEdge; to: string }>>;
}

function buildGraph(building: Building): Graph {
  const nodes = new Map(building.nodes.map((n) => [n.id, n]));
  const levels = new Map(building.floors.map((f) => [f.id, f.level]));
  const adjacency = new Map<string, Array<{ edge: MapEdge; to: string }>>();
  for (const n of building.nodes) adjacency.set(n.id, []);
  for (const e of building.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    adjacency.get(e.from)!.push({ edge: e, to: e.to });
    adjacency.get(e.to)!.push({ edge: e, to: e.from });
  }
  return { nodes, levels, adjacency };
}

export function edgeCost(edge: MapEdge, a: MapNode, b: MapNode, levels: Map<string, number>): number {
  const dLevel = Math.abs((levels.get(a.floorId) ?? 0) - (levels.get(b.floorId) ?? 0));
  switch (edge.kind) {
    case 'stairs':
      return STAIRS_COST_PER_LEVEL * Math.max(1, dLevel);
    case 'elevator':
      return ELEVATOR_BASE_COST + ELEVATOR_COST_PER_LEVEL * Math.max(1, dLevel);
    default:
      return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

/** Minimal binary min-heap keyed on priority. */
class MinHeap<T> {
  private items: Array<{ p: number; v: T }> = [];
  get size() {
    return this.items.length;
  }
  push(v: T, p: number) {
    const a = this.items;
    a.push({ p, v });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].p <= a[i].p) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): { p: number; v: T } | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Cheapest possible cost of changing one level (lower bound for A*). */
const MIN_COST_PER_LEVEL = Math.min(STAIRS_COST_PER_LEVEL, ELEVATOR_BASE_COST + ELEVATOR_COST_PER_LEVEL);

/**
 * Builds an admissible A* heuristic. Straight-line distance is a valid lower
 * bound only if every stair/elevator edge joins points with the same x/y
 * (vertically aligned shafts). If any shaft is misaligned, e.g. on an
 * imported floor, the heuristic falls back to the level-change cost alone,
 * which is still admissible.
 */
function makeHeuristic(building: Building, g: Graph, goal: MapNode): (n: MapNode) => number {
  const aligned = building.edges.every((e) => {
    if (e.kind === 'walkway') return true;
    const a = g.nodes.get(e.from);
    const b = g.nodes.get(e.to);
    return !a || !b || Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
  });
  const goalLevel = g.levels.get(goal.floorId) ?? 0;
  return (n) => {
    const dl = Math.abs((g.levels.get(n.floorId) ?? 0) - goalLevel);
    const planar = aligned ? Math.hypot(n.x - goal.x, n.y - goal.y) : 0;
    return planar + MIN_COST_PER_LEVEL * dl;
  };
}

/**
 * Finds the cheapest route between two nodes using A* search.
 * Accessible mode removes stair edges. Edges in `blockedEdges` (from user
 * reports) are skipped, which is how automatic rerouting works.
 */
export function findRoute(building: Building, req: RouteRequest): RouteResult {
  const g = buildGraph(building);
  const start = g.nodes.get(req.fromId);
  const goal = g.nodes.get(req.toId);
  if (!start) return { ok: false, reason: 'Start location not found.' };
  if (!goal) return { ok: false, reason: 'Destination not found.' };
  if (start.id === goal.id) {
    return {
      ok: true,
      route: { nodeIds: [start.id], edgeIds: [], distance: 0, walkDistance: 0, minutes: 0, steps: [{ nodeId: start.id, floorId: start.floorId, instruction: `You are already at ${name(start)}.`, action: 'arrive', distance: 0 }] },
    };
  }

  const blocked = req.blockedEdges ?? new Set<string>();
  const h = makeHeuristic(building, g, goal);
  const dist = new Map<string, number>([[start.id, 0]]);
  const prev = new Map<string, { node: string; edge: string }>();
  const closed = new Set<string>();
  const heap = new MinHeap<string>();
  heap.push(start.id, h(start));
  let expanded = 0;

  while (heap.size > 0) {
    const { v } = heap.pop()!;
    if (closed.has(v)) continue;
    closed.add(v);
    expanded++;
    if (v === goal.id) break;
    const a = g.nodes.get(v)!;
    const p = dist.get(v)!;
    for (const { edge, to } of g.adjacency.get(v)!) {
      if (blocked.has(edge.id)) continue;
      if (req.options.accessible && edge.kind === 'stairs') continue;
      const b = g.nodes.get(to)!;
      // Do not route *through* other rooms; rooms are only start/end points.
      if (b.kind === 'room' && b.id !== goal.id) continue;
      const nd = p + edgeCost(edge, a, b, g.levels);
      if (!closed.has(to) && nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { node: v, edge: edge.id });
        heap.push(to, nd + h(b));
      }
    }
  }

  if (!dist.has(goal.id)) {
    return {
      ok: false,
      reason: req.options.accessible
        ? 'No step-free route is available right now. An elevator may be out of service or a corridor may be blocked.'
        : 'No route is available right now. A corridor may be blocked.',
    };
  }

  const nodeIds: string[] = [goal.id];
  const edgeIds: string[] = [];
  let cur = goal.id;
  while (cur !== start.id) {
    const p = prev.get(cur)!;
    edgeIds.unshift(p.edge);
    nodeIds.unshift(p.node);
    cur = p.node;
  }

  const route: Route = {
    nodeIds,
    edgeIds,
    distance: dist.get(goal.id)!,
    walkDistance: 0,
    minutes: 0,
    steps: [],
    expanded,
  };
  route.steps = buildSteps(building, route, g);
  return { ok: true, route };
}

function name(n: MapNode): string {
  return n.label ?? n.id;
}

export const WALK_SPEED_MPS = 1.2;
/** Seconds added per vertical transition (waiting for an elevator, climbing). */
const VERTICAL_SECONDS: Record<'stairs' | 'elevator', number> = { stairs: 20, elevator: 45 };

/**
 * Classifies the turn at B when walking A -> B -> C. Map y grows downwards,
 * so a positive (clockwise) angle is a right turn. Ported from FloorNav.
 */
export function turnAt(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): Maneuver {
  let diff = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const deg = (diff * 180) / Math.PI;
  if (Math.abs(deg) < 20) return 'straight';
  if (deg >= 20 && deg < 60) return 'slight-right';
  if (deg >= 60) return 'turn-right';
  if (deg <= -20 && deg > -60) return 'slight-left';
  return 'turn-left';
}

const TURN_TEXT: Partial<Record<Maneuver, string>> = {
  'turn-left': 'Turn left',
  'turn-right': 'Turn right',
  'slight-left': 'Bear left',
  'slight-right': 'Bear right',
};

/** Nearest named place within `radius` metres of a point, for landmark hints. */
function landmarkNear(building: Building, floorId: string, x: number, y: number, exclude: Set<string>, radius = 7): MapNode | undefined {
  let best: MapNode | undefined;
  let bestD = radius;
  for (const n of building.nodes) {
    if (n.floorId !== floorId || n.kind === 'corridor' || !n.label || exclude.has(n.id)) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function buildSteps(building: Building, route: Route, g: Graph): RouteStep[] {
  const floorName = new Map(building.floors.map((f) => [f.id, f.name]));
  const edges = new Map(building.edges.map((e) => [e.id, e]));
  const ids = route.nodeIds;
  const node = (i: number) => g.nodes.get(ids[i])!;
  const first = node(0);
  const last = node(ids.length - 1);
  const exclude = new Set([first.id, last.id]);
  const steps: RouteStep[] = [
    { nodeId: first.id, floorId: first.floorId, instruction: `Start at ${name(first)} (${floorName.get(first.floorId)}).`, action: 'start', distance: 0 },
  ];

  let walk = 0;
  let seconds = 0;
  let walkTotal = 0;
  const flushWalk = (to: MapNode, prefix?: string, action: Maneuver = 'straight') => {
    if (walk <= 0) return;
    const m = Math.max(1, Math.round(walk));
    steps.push({ nodeId: to.id, floorId: to.floorId, instruction: `${prefix ?? 'Walk'} about ${m} m to ${name(to)}.`, action, distance: walk });
    walk = 0;
  };

  for (let i = 0; i < route.edgeIds.length; i++) {
    const e = edges.get(route.edgeIds[i])!;
    const a = node(i);
    const b = node(i + 1);
    if (e.kind === 'walkway') {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      walk += d;
      walkTotal += d;
      // Turn detection at b, if the next edge is also a walkway on this floor.
      const nextEdge = route.edgeIds[i + 1] ? edges.get(route.edgeIds[i + 1]) : undefined;
      if (nextEdge?.kind === 'walkway' && b.kind === 'corridor') {
        const c = node(i + 2);
        const action = turnAt(a, b, c);
        if (action !== 'straight') {
          const lm = landmarkNear(building, b.floorId, b.x, b.y, exclude);
          const m = Math.max(1, Math.round(walk));
          steps.push({
            nodeId: b.id,
            floorId: b.floorId,
            instruction: `Walk about ${m} m, then ${TURN_TEXT[action]!.toLowerCase()}${lm ? ` near ${name(lm).replace(/\s*\(Floor [^)]*\)$/, '')}` : ''}.`,
            action,
            distance: walk,
          });
          walk = 0;
        }
      }
      continue;
    }
    // Collapse a run of vertical edges (e.g. elevator 1 -> 2 -> 3) into one step.
    let j = i;
    while (j + 1 < route.edgeIds.length && edges.get(route.edgeIds[j + 1])!.kind === e.kind) j++;
    const end = node(j + 1);
    flushWalk(a);
    const kind = e.kind as 'stairs' | 'elevator';
    seconds += VERTICAL_SECONDS[kind] * (j - i + 1);
    steps.push({
      nodeId: end.id,
      floorId: end.floorId,
      instruction: `${kind === 'elevator' ? 'Take the elevator' : 'Take the stairs'} to ${floorName.get(end.floorId)}.`,
      action: kind === 'elevator' ? 'take-elevator' : 'take-stairs',
      distance: 0,
    });
    i = j;
  }
  flushWalk(last);
  steps.push({ nodeId: last.id, floorId: last.floorId, instruction: `Arrive at ${name(last)}.`, action: 'arrive', distance: 0 });
  route.walkDistance = walkTotal;
  route.minutes = Math.max(1, Math.round((walkTotal / WALK_SPEED_MPS + seconds) / 6) / 10);
  return steps;
}

/** Case-insensitive search over room labels, ids and aliases. */
export function searchPlaces(building: Building, query: string, limit = 8): MapNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const searchable = building.nodes.filter((n) => n.kind !== 'corridor' && n.label);
  const scored = searchable
    .map((n) => {
      const terms = [n.label!, n.id, ...(n.aliases ?? [])].map((t) => t.toLowerCase());
      let score = Infinity;
      for (const t of terms) {
        if (t === q) score = Math.min(score, 0);
        else if (t.startsWith(q)) score = Math.min(score, 1);
        else if (t.includes(q)) score = Math.min(score, 2);
      }
      return { n, score };
    })
    .filter((s) => s.score < Infinity)
    .sort((a, b) => a.score - b.score || a.n.label!.localeCompare(b.n.label!, undefined, { numeric: true }));
  return scored.slice(0, limit).map((s) => s.n);
}
