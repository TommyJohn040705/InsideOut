/**
 * Outdoor walking routes on the OpenStreetMap path network (src/data/campus/paths.json).
 * Routes only follow mapped ways. An entrance that is not itself on a mapped way is joined to
 * the nearest path node, and that join is reported (connectorM) so the UI can say so.
 */
import { distanceM, type LngLat } from './georef';

export interface PathData {
  nodes: LngLat[];
  edges: [number, number, number][]; // kind: 0 walkway, 1 steps, 2 indoor corridor or bridge
  entranceNodes: Record<string, number>;
  fetchedAt?: string;
}

export interface OutdoorGraph {
  data: PathData;
  adj: { to: number; m: number; kind: number }[][];
}

export interface OutdoorRoute {
  coords: LngLat[];
  distanceM: number;
  usesSteps: boolean;
  /** Straight joins from a point (entrance or GPS fix) to the path network, metres. */
  connectorsM: number[];
}

/** Joins farther than this are refused rather than drawn across a lawn or through a building. */
export const MAX_CONNECTOR_M = 40;

export function buildGraph(data: PathData): OutdoorGraph {
  const adj: OutdoorGraph['adj'] = data.nodes.map(() => []);
  for (const [a, b, kind] of data.edges) {
    const m = distanceM(data.nodes[a], data.nodes[b]);
    adj[a].push({ to: b, m, kind });
    adj[b].push({ to: a, m, kind });
  }
  return { data, adj };
}

/** Nearest path node to a point, with the straight distance to it. */
export function nearestNode(g: OutdoorGraph, p: LngLat, stepFree = false): { node: number; m: number } | null {
  let best = -1, bestM = Infinity;
  g.data.nodes.forEach((n, i) => {
    if (!g.adj[i].length || (stepFree && g.adj[i].every((e) => e.kind === 1))) return;
    const m = distanceM(n, p);
    if (m < bestM) { bestM = m; best = i; }
  });
  return best < 0 ? null : { node: best, m: bestM };
}

/** Graph node for an entrance: its own OSM node when drawn on a path, else the nearest node. */
export function attach(g: OutdoorGraph, p: { id?: string; position: LngLat }, stepFree = false): { node: number; m: number } | null {
  const own = p.id != null ? g.data.entranceNodes[p.id] : undefined;
  if (own != null && g.adj[own].length) return { node: own, m: 0 };
  const n = nearestNode(g, p.position, stepFree);
  return n && n.m <= MAX_CONNECTOR_M ? n : null;
}

/** A* between two points. stepFree skips ways tagged as steps or wheelchair=no. */
export function routeOutdoor(g: OutdoorGraph, from: { id?: string; position: LngLat }, to: { id?: string; position: LngLat }, stepFree = false): OutdoorRoute | null {
  const a = attach(g, from, stepFree), b = attach(g, to, stepFree);
  if (!a || !b) return null;
  const N = g.data.nodes, goal = N[b.node];
  const gScore = new Map<number, number>([[a.node, 0]]);
  const prev = new Map<number, number>();
  const open: [number, number][] = [[distanceM(N[a.node], goal), a.node]]; // [f, node]
  const closed = new Set<number>();
  while (open.length) {
    // shortcut: linear-scan priority queue, fine for campus-sized graphs (~25k nodes); upgrade to a heap if routing feels slow
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === b.node) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const e of g.adj[cur]) {
      if (stepFree && e.kind === 1) continue;
      const t = gScore.get(cur)! + e.m;
      if (t < (gScore.get(e.to) ?? Infinity)) {
        gScore.set(e.to, t);
        prev.set(e.to, cur);
        open.push([t + distanceM(N[e.to], goal), e.to]);
      }
    }
  }
  if (!gScore.has(b.node)) return null;
  const path = [b.node];
  while (path[path.length - 1] !== a.node) path.push(prev.get(path[path.length - 1])!);
  path.reverse();
  let usesSteps = false;
  for (let i = 1; i < path.length; i++) if (g.adj[path[i - 1]].find((e) => e.to === path[i])?.kind === 1) usesSteps = true;
  const coords: LngLat[] = path.map((i) => N[i]);
  if (a.m > 0) coords.unshift(from.position);
  if (b.m > 0) coords.push(to.position);
  return { coords, distanceM: gScore.get(b.node)! + a.m + b.m, usesSteps, connectorsM: [a.m, b.m].filter((m) => m > 0) };
}

let cached: Promise<OutdoorGraph> | null = null;
/** The path data is ~1 MB, so it loads on first use instead of with the app. */
export const loadOutdoorGraph = () => (cached ??= import('../data/campus/paths.json').then((m) => buildGraph((m.default ?? m) as unknown as PathData)));
