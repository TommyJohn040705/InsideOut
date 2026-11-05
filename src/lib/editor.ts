import type { Building, EdgeKind, MapNode, NodeKind } from './types';

/**
 * Pure, immutable editing operations for a building's floor plan graph.
 * Used by the in-app floor plan editor; every function returns a new Building.
 */

let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export function addNode(
  b: Building,
  floorId: string,
  kind: NodeKind,
  x: number,
  y: number,
  label?: string,
): { building: Building; node: MapNode } {
  const node: MapNode = { id: uid('n'), floorId, kind, x, y };
  if (label) node.label = label;
  else if (kind !== 'corridor') node.label = defaultLabel(kind, b, floorId);
  if (kind === 'stairs' || kind === 'elevator') node.shaftId = uid(`${kind}-shaft`);
  if (kind === 'room' || kind === 'entrance') {
    const floor = b.floors.find((f) => f.id === floorId);
    const half = 3;
    // Keep the new room's outline inside the floor.
    const cx = (v: number, max?: number) => Math.min(max ?? Infinity, Math.max(0, v));
    const x0 = cx(x - half, floor?.width), x1 = cx(x + half, floor?.width);
    const y0 = cx(y - half, floor?.height), y1 = cx(y + half, floor?.height);
    const polygon: Array<[number, number]> = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    if (floor) {
      return {
        node,
        building: {
          ...b,
          nodes: [...b.nodes, node],
          floors: b.floors.map((f) => (f.id === floorId ? { ...f, rooms: [...f.rooms, { nodeId: node.id, polygon }] } : f)),
        },
      };
    }
  }
  return { node, building: { ...b, nodes: [...b.nodes, node] } };
}

function defaultLabel(kind: NodeKind, b: Building, floorId: string): string {
  const floor = b.floors.find((f) => f.id === floorId);
  const count = b.nodes.filter((n) => n.floorId === floorId && n.kind === kind).length + 1;
  const base = { room: 'New Room', entrance: 'Entrance', stairs: 'Stairs', elevator: 'Elevator', corridor: '' }[kind];
  return `${base} ${count}${floor && (kind === 'stairs' || kind === 'elevator') ? ` (${floor.name})` : ''}`;
}

/** Moves a node; a room's outline moves with it. */
export function moveNode(b: Building, nodeId: string, x: number, y: number): Building {
  const node = b.nodes.find((n) => n.id === nodeId);
  if (!node) return b;
  const dx = x - node.x;
  const dy = y - node.y;
  return {
    ...b,
    nodes: b.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    floors: b.floors.map((f) =>
      f.id !== node.floorId
        ? f
        : {
            ...f,
            rooms: f.rooms.map((r) =>
              r.nodeId === nodeId ? { ...r, polygon: r.polygon.map(([px, py]) => [px + dx, py + dy] as [number, number]) } : r,
            ),
          },
    ),
  };
}

export function updateNode(b: Building, nodeId: string, patch: Partial<Pick<MapNode, 'label' | 'aliases' | 'kind'>>): Building {
  return { ...b, nodes: b.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) };
}

/** Deletes a node together with its connections and room outline. */
export function deleteNode(b: Building, nodeId: string): Building {
  return {
    ...b,
    nodes: b.nodes.filter((n) => n.id !== nodeId),
    edges: b.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    floors: b.floors.map((f) => ({ ...f, rooms: f.rooms.filter((r) => r.nodeId !== nodeId) })),
  };
}

/**
 * Connects two nodes. Same-floor nodes get a walkway. Nodes on different
 * floors can only be joined if both are stairs or both are elevators; they
 * then share a shaft id so the connection is recognised as one shaft.
 */
export function connectNodes(b: Building, fromId: string, toId: string): { building: Building; error?: string } {
  if (fromId === toId) return { building: b, error: 'Pick two different points.' };
  const a = b.nodes.find((n) => n.id === fromId);
  const c = b.nodes.find((n) => n.id === toId);
  if (!a || !c) return { building: b, error: 'Point not found.' };
  if (b.edges.some((e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId))) {
    return { building: b, error: 'These points are already connected.' };
  }
  let kind: EdgeKind = 'walkway';
  let nodes = b.nodes;
  if (a.floorId !== c.floorId) {
    if (a.kind !== c.kind || (a.kind !== 'stairs' && a.kind !== 'elevator')) {
      return { building: b, error: 'Only stairs-to-stairs or elevator-to-elevator can connect different floors.' };
    }
    kind = a.kind;
    const shaft = a.shaftId ?? c.shaftId ?? uid(`${a.kind}-shaft`);
    const oldShaft = c.shaftId;
    nodes = b.nodes.map((n) =>
      n.id === a.id || n.id === c.id || (oldShaft && n.shaftId === oldShaft) ? { ...n, shaftId: shaft } : n,
    );
  }
  return {
    building: { ...b, nodes, edges: [...b.edges, { id: uid('e'), from: fromId, to: toId, kind }] },
  };
}

export function deleteEdge(b: Building, edgeId: string): Building {
  return { ...b, edges: b.edges.filter((e) => e.id !== edgeId) };
}

export function addFloor(b: Building, name?: string): { building: Building; floorId: string } {
  const top = b.floors.reduce((m, f) => (f.level > m.level ? f : m), b.floors[0]);
  const level = top ? top.level + 1 : 1;
  const floorId = uid('f');
  return {
    floorId,
    building: {
      ...b,
      floors: [...b.floors, { id: floorId, name: name ?? `Floor ${level}`, level, width: top?.width ?? 60, height: top?.height ?? 30, rooms: [] }],
    },
  };
}

export function deleteFloor(b: Building, floorId: string): Building {
  const gone = new Set(b.nodes.filter((n) => n.floorId === floorId).map((n) => n.id));
  return {
    ...b,
    floors: b.floors.filter((f) => f.id !== floorId),
    nodes: b.nodes.filter((n) => !gone.has(n.id)),
    edges: b.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)),
  };
}

/** Basic structural validation, used before saving or importing JSON. */
export function validateBuilding(value: unknown): value is Building {
  if (!value || typeof value !== 'object') return false;
  const b = value as Building;
  if (!Array.isArray(b.floors) || !Array.isArray(b.nodes) || !Array.isArray(b.edges)) return false;
  if (b.floors.length === 0) return false;
  const floorIds = new Set(b.floors.map((f) => f.id));
  const nodeIds = new Set(b.nodes.map((n) => n.id));
  return (
    b.nodes.every((n) => typeof n.id === 'string' && floorIds.has(n.floorId) && Number.isFinite(n.x) && Number.isFinite(n.y)) &&
    b.edges.every((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  );
}

const BUILDINGS_KEY = 'insideout.buildings.v2';
const ACTIVE_KEY = 'insideout.activeBuilding.v2';

/** Loads saved buildings, or null if nothing valid is stored. */
export function loadBuildings(): Building[] | null {
  try {
    const raw = localStorage.getItem(BUILDINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(validateBuilding);
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

/** Saves buildings; returns false if the browser refused (e.g. storage full). */
export function saveBuildings(buildings: Building[]): boolean {
  try {
    localStorage.setItem(BUILDINGS_KEY, JSON.stringify(buildings));
    return true;
  } catch {
    return false;
  }
}

export function loadActiveBuildingId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveBuildingId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

export function clearSavedBuildings(): void {
  try {
    localStorage.removeItem(BUILDINGS_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}
