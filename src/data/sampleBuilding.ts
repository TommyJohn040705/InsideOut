import type { Building, EdgeKind, Floor, MapEdge, MapNode, NodeKind, RoomShape } from '../lib/types';

/**
 * Demo building: three floors, each 60 m x 30 m, with a loop of corridors
 * (north and south hallways joined at the west, centre and east), west and
 * east stairwells, and a central elevator. The loop means a blocked corridor
 * can always be routed around, which is useful for demonstrating reports.
 */

const WIDTH = 60;
const HEIGHT = 30;
const JUNCTION_X = [5, 10, 20, 30, 40, 50, 55];
const ROOM_X = [10, 20, 30, 40, 50];

const SPECIAL_NAMES: Record<string, { label: string; aliases?: string[]; kind?: NodeKind }> = {
  'f1-N-30': { label: 'Cafeteria', aliases: ['food', 'cafe'] },
  'f1-S-30': { label: 'Main Entrance', aliases: ['entrance', 'lobby', 'front door'], kind: 'entrance' },
  'f2-N-30': { label: 'Library', aliases: ['books', 'study'] },
  'f2-S-30': { label: 'Study Lounge', aliases: ['lounge'] },
  'f3-N-30': { label: 'Lecture Hall 301', aliases: ['LH301', 'lecture hall'] },
  'f3-S-30': { label: 'Computer Lab', aliases: ['lab', 'computers'] },
};

function edge(from: string, to: string, kind: EdgeKind = 'walkway'): MapEdge {
  return { id: `${from}__${to}`, from, to, kind };
}

function rect(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function buildFloor(level: number): { floor: Floor; nodes: MapNode[]; edges: MapEdge[] } {
  const f = `f${level}`;
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const rooms: RoomShape[] = [];

  // Corridor junctions along the north (y=10) and south (y=20) hallways.
  for (const row of ['N', 'S'] as const) {
    const y = row === 'N' ? 10 : 20;
    JUNCTION_X.forEach((x, i) => {
      nodes.push({ id: `${f}-${row}${x}`, floorId: f, kind: 'corridor', x, y });
      if (i > 0) edges.push(edge(`${f}-${row}${JUNCTION_X[i - 1]}`, `${f}-${row}${x}`));
    });
  }

  // Cross corridors at west, centre and east, each with a midpoint node.
  for (const [key, x] of [['W', 5], ['M', 30], ['E', 55]] as const) {
    nodes.push({ id: `${f}-${key}`, floorId: f, kind: 'corridor', x, y: 15 });
    edges.push(edge(`${f}-N${x}`, `${f}-${key}`), edge(`${f}-${key}`, `${f}-S${x}`));
  }

  // Vertical circulation.
  nodes.push(
    { id: `${f}-stW`, floorId: f, kind: 'stairs', x: 1.5, y: 15, label: `West Stairs (Floor ${level})`, aliases: ['stairs'], shaftId: 'stairs-west' },
    { id: `${f}-stE`, floorId: f, kind: 'stairs', x: 58.5, y: 15, label: `East Stairs (Floor ${level})`, aliases: ['stairs'], shaftId: 'stairs-east' },
    { id: `${f}-elev`, floorId: f, kind: 'elevator', x: 34, y: 15, label: `Elevator (Floor ${level})`, aliases: ['elevator', 'lift'], shaftId: 'elevator-main' },
    { id: `${f}-wc`, floorId: f, kind: 'room', x: 24, y: 15, label: `Washrooms (Floor ${level})`, aliases: ['washroom', 'bathroom', 'restroom', 'toilet'] },
  );
  edges.push(
    edge(`${f}-W`, `${f}-stW`),
    edge(`${f}-E`, `${f}-stE`),
    edge(`${f}-M`, `${f}-elev`),
    edge(`${f}-M`, `${f}-wc`),
  );
  rooms.push(
    { nodeId: `${f}-wc`, polygon: rect(19, 12, 28, 18) },
    { nodeId: `${f}-elev`, polygon: rect(32, 12, 37, 18) },
    { nodeId: `${f}-stW`, polygon: rect(0, 12, 3, 18) },
    { nodeId: `${f}-stE`, polygon: rect(57, 12, 60, 18) },
  );

  // Rooms off the north and south hallways.
  let num = 1;
  for (const row of ['N', 'S'] as const) {
    for (const x of ROOM_X) {
      const id = `${f}-${row}-${x}`;
      const roomNo = `${level}${String(num).padStart(2, '0')}`;
      num++;
      const special = SPECIAL_NAMES[id];
      const y = row === 'N' ? 4 : 26;
      nodes.push({
        id,
        floorId: f,
        kind: special?.kind ?? 'room',
        x,
        y,
        label: special?.label ?? `Room ${roomNo}`,
        aliases: [roomNo, ...(special?.aliases ?? [])],
      });
      edges.push(edge(`${f}-${row}${x}`, id));
      rooms.push({ nodeId: id, polygon: row === 'N' ? rect(x - 4.5, 0, x + 4.5, 8.5) : rect(x - 4.5, 21.5, x + 4.5, 30) });
    }
  }

  return {
    floor: { id: f, name: `Floor ${level}`, level, width: WIDTH, height: HEIGHT, rooms },
    nodes,
    edges,
  };
}

export function createSampleBuilding(): Building {
  const levels = [1, 2, 3];
  const parts = levels.map(buildFloor);
  const edges = parts.flatMap((p) => p.edges);
  for (let i = 1; i < levels.length; i++) {
    const lo = `f${levels[i - 1]}`;
    const hi = `f${levels[i]}`;
    edges.push(
      edge(`${lo}-elev`, `${hi}-elev`, 'elevator'),
      edge(`${lo}-stW`, `${hi}-stW`, 'stairs'),
      edge(`${lo}-stE`, `${hi}-stE`, 'stairs'),
    );
  }
  return {
    id: 'demo-hall',
    name: 'Demo Hall',
    floors: parts.map((p) => p.floor),
    nodes: parts.flatMap((p) => p.nodes),
    edges,
  };
}
