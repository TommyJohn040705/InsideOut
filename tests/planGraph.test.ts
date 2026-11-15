import { describe, expect, it } from 'vitest';
import { buildPlanGraph } from '../src/campus/planGraph';

/** 400 x 300 drawing: corridor, room A (door), room B (no door), room C (door with a swing arc). */
function drawing() {
  const W = 400, H = 300, g = new Uint8Array(W * H).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * W + x] = 0; };
  const hline = (y: number, x0: number, x1: number) => rect(x0, y, x1, y + 2); // 3 px walls, thin like Plant Operations partitions
  const vline = (x: number, y0: number, y1: number) => rect(x, y0, x + 2, y1);
  hline(40, 40, 360); hline(260, 40, 360); vline(40, 40, 260); vline(360, 40, 262);
  hline(120, 40, 100); hline(120, 124, 360);   // corridor top wall, A's door at x 100-124
  vline(180, 40, 120);                          // A | B, B has no door
  hline(180, 40, 150); hline(180, 174, 360);   // corridor bottom wall, C's door at x 150-174
  vline(200, 180, 260);
  for (let t = 0; t <= 90; t += 0.5) {         // C's door swing: 1 px arc from the far jamb, 1 px leaf
    const a = (t * Math.PI) / 180;
    g[Math.round(181 + 24 * Math.sin(a)) * W + Math.round(150 + 24 * Math.cos(a))] = 0;
  }
  for (let y = 181; y <= 204; y++) g[y * W + 150] = 0;
  return { g, W, H };
}
const pct = (x: number, y: number, W: number, H: number) => ({ x: (x / W) * 100, y: (y / H) * 100 });

describe('hallway network read off a drawing', () => {
  const { g, W, H } = drawing();
  const rooms = [
    { id: 'A', coords: pct(110, 80, W, H), category: 'office' },
    { id: 'B', coords: pct(270, 80, W, H), category: 'office' },
    { id: 'C', coords: pct(120, 220, W, H), category: 'office' },
    { id: 'K', coords: pct(250, 150, W, H), category: 'corridor' },
  ];
  const pg = buildPlanGraph(g, W, H, rooms, 't', { outsideCloseCells: 4 });
  const byId = new Map(pg.hallways.map((n) => [n.id, n]));
  const nodeOf = (room: string) => pg.hallways.find((n) => n.connectedTo.includes(room))!;
  const reach = (from: string) => {
    const seen = new Set([from]), st = [from];
    while (st.length) for (const t of byId.get(st.pop()!)!.connectedTo) if (byId.has(t) && !seen.has(t)) { seen.add(t); st.push(t); }
    return seen;
  };

  it('links every room to the network', () => {
    expect(pg.unlinkedRoomIds).toEqual([]);
  });

  it('joins rooms with doors through their doorways, even past a door swing arc', () => {
    const r = reach(nodeOf('A').id);
    expect(r.has(nodeOf('C').id)).toBe(true);
    expect(r.has(nodeOf('K').id)).toBe(true);
  });

  it('never joins a room that has no doorway', () => {
    expect(reach(nodeOf('A').id).has(nodeOf('B').id)).toBe(false);
  });

  it('never draws an edge through a wall', () => {
    const { w, cellPx, open } = pg.grid;
    const cell = (p: { x: number; y: number }) => [Math.floor((p.x / 100) * W / cellPx), Math.floor((p.y / 100) * H / cellPx)];
    for (const n of pg.hallways) for (const t of n.connectedTo) {
      const m = byId.get(t);
      if (!m) continue;
      const [ax, ay] = cell(n.coords), [bx, by] = cell(m.coords), k = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
      for (let i = 0; i <= k; i++) expect(open[Math.round(ay + ((by - ay) * i) / k) * w + Math.round(ax + ((bx - ax) * i) / k)]).toBe(1);
    }
  });

  it('marks nodes inside rooms as costlier than corridor nodes', () => {
    expect(nodeOf('A').cost).toBeGreaterThan(1);
    expect(nodeOf('K').cost).toBeUndefined();
  });
});

import { verticalLinksFor } from '../src/campus/floorImports';
import { calculateIndoorRoute } from '../src/utils/pathfinding';
import type { FloorPlanData, RoomPOI } from '../src/types/navigation';

describe('stairs and elevators across imported floors', () => {
  const room = (id: string, roomNumber: string, category: string, x: number): RoomPOI => ({ id, roomNumber, name: `Room ${roomNumber}`, category, coords: { x, y: 50 } } as RoomPOI);
  const floor = (n: number, rooms: RoomPOI[]): FloorPlanData => ({
    id: `f${n}`, title: '', floorNumber: n, buildingId: 'import-X', buildingName: 'X', buildingType: 'University', summary: '', imageUrl: '',
    rooms, hallways: [{ id: `h${n}a`, coords: { x: 10, y: 50 }, connectedTo: [`h${n}b`, ...rooms.filter((r) => r.coords.x < 50).map((r) => r.id)] },
      { id: `h${n}b`, coords: { x: 90, y: 50 }, connectedTo: [`h${n}a`, ...rooms.filter((r) => r.coords.x >= 50).map((r) => r.id)] }],
  } as FloorPlanData);

  it('reads "1093 ELV" as shaft 093 and carries it to a lobby numbered the same, never to an office', () => {
    const plans = [
      floor(1, [room('a1', '1093 ELV', 'elevator', 20), room('o1', '1050', 'office', 80)]),
      floor(2, [room('a2', '2093', 'corridor', 20), room('o2', '2050', 'office', 80)]),
      floor(3, [room('a3', '3093', 'office', 20)]),
    ];
    const links = verticalLinksFor(plans);
    expect(links.map((l) => [l.type, l.floorsServed])).toEqual([['elevator', [1, 2]]]);
  });

  it('refuses a step-free route when no elevator serves both floors', () => {
    const plans = [floor(1, [room('s1', '1095', 'stairs', 20), room('o1', '1050', 'office', 80)]), floor(2, [room('s2', '2095', 'stairs', 20), room('o2', '2050', 'office', 80)])];
    const links = verticalLinksFor(plans);
    const go = (acc: boolean) => calculateIndoorRoute(plans[0], plans[0].rooms[1].coords, 'A', plans[1].rooms[1].coords, 'B', 'o1', 'o2', { isAccessibleOnly: acc, allFloors: plans, startFloor: 1, endFloor: 2, verticalLinks: links });
    expect(() => go(true)).toThrow(/no step-free route/);
    expect(go(false).steps.some((s) => s.isVerticalTransition)).toBe(true);
  });
});

describe('matching shafts by position', () => {
  const room = (id: string, roomNumber: string, category: string, x: number, y: number): RoomPOI => ({ id, roomNumber, name: `Room ${roomNumber}`, category, coords: { x, y } } as RoomPOI);
  const floor = (n: number, rooms: RoomPOI[]): FloorPlanData => ({
    id: `f${n}`, title: '', floorNumber: n, buildingId: 'import-X', buildingName: 'X', buildingType: 'University', summary: '', imageUrl: '',
    rooms, hallways: [{ id: `h${n}`, coords: { x: 50, y: 50 }, connectedTo: rooms.map((r) => r.id) }],
  } as FloorPlanData);
  // 1 % of the sheet = 1 m; floor 2's alignment sits 4 m east of floor 1's.
  const M_LNG = 1 / (111320 * Math.cos((43.47 * Math.PI) / 180)), M_LAT = 1 / 111320;
  const locate = (f: number, p: { x: number; y: number }): [number, number] => [-80.54 + (p.x + (f === 2 ? 4 : 0)) * M_LNG, 43.47 - p.y * M_LAT];

  it('joins differently numbered shafts in the same place, allowing for a whole-floor shift', () => {
    const plans = [
      floor(1, [room('e1', '1101', 'elevator', 20, 20), room('s1', '1150', 'stairs', 70, 60)]),
      floor(2, [room('e2', '2215', 'elevator', 20, 20), room('s2', '2290', 'stairs', 70, 60), room('x2', '2300', 'elevator', 70, 61)]),
    ];
    const links = verticalLinksFor(plans, locate);
    expect(links.map((l) => [l.type, l.nodes.map((n) => n.roomId)]).sort()).toEqual([['elevator', ['e1', 'e2']], ['stairs', ['s1', 's2']]]);
  });

  it('does not join shafts by number alone when there is no map position, nor across types', () => {
    const plans = [floor(1, [room('e1', '1101', 'elevator', 20, 20)]), floor(2, [room('s2', '2215', 'stairs', 20, 20)])];
    expect(verticalLinksFor(plans, locate)).toEqual([]);
    expect(verticalLinksFor(plans)).toEqual([]);
  });
});

import { detectStairs, buildPlanGraph as build2 } from '../src/campus/planGraph';

describe('stairs found on a drawing', () => {
  // 300 x 200 sheet: a corridor box with a flight of 8 treads (1 px lines, 6 px apart) at one end.
  const W = 300, H = 200, g = new Uint8Array(W * H).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * W + x] = 0; };
  rect(20, 20, 280, 22); rect(20, 120, 280, 122); rect(20, 20, 22, 122); rect(278, 20, 280, 122);
  for (let i = 0; i < 8; i++) rect(230 + i * 6, 40, 230 + i * 6, 70);
  rect(100, 150, 140, 180); // a solid black block is not a stair

  it('finds the flight and not the solid block', () => {
    const s = detectStairs(g, W, H);
    expect(s.length).toBe(1);
    expect(s[0].x0).toBeGreaterThanOrEqual(228);
  });

  it('adds it as a stairs room joined to the network, unless a stairs room is already there', () => {
    const rooms = [{ id: 'k', coords: { x: 30, y: 50 }, category: 'corridor' }];
    const pg = build2(g, W, H, rooms, 't', { outsideCloseCells: 4, stairs: detectStairs(g, W, H) });
    expect(pg.addedRooms.map((r) => r.category)).toEqual(['stairs']);
    expect(pg.hallways.some((n) => n.connectedTo.includes(pg.addedRooms[0].id))).toBe(true);
    const again = build2(g, W, H, [...rooms, { id: 's', coords: { x: 85, y: 27 }, category: 'stairs' }], 't', { outsideCloseCells: 4, stairs: detectStairs(g, W, H) });
    expect(again.addedRooms).toEqual([]);
  });
});

describe('changing between stairs and elevators', () => {
  const room = (id: string, roomNumber: string, category: string, x: number): RoomPOI => ({ id, roomNumber, name: `Room ${roomNumber}`, category, coords: { x, y: 50 } } as RoomPOI);
  const floor = (n: number, rooms: RoomPOI[]): FloorPlanData => ({
    id: `f${n}`, title: '', floorNumber: n, buildingId: 'import-X', buildingName: 'X', buildingType: 'University', summary: '', imageUrl: '',
    rooms, hallways: [{ id: `h${n}a`, coords: { x: 10, y: 50 }, connectedTo: [`h${n}b`, ...rooms.filter((r) => r.coords.x < 50).map((r) => r.id)] },
      { id: `h${n}b`, coords: { x: 90, y: 50 }, connectedTo: [`h${n}a`, ...rooms.filter((r) => r.coords.x >= 50).map((r) => r.id)] }],
  } as FloorPlanData);
  // Stairs 1-2 on the left, elevator 2-3 on the right.
  const plans = [
    floor(1, [room('s1', '1095', 'stairs', 20), room('o1', '1050', 'office', 60)]),
    floor(2, [room('s2', '2095', 'stairs', 20), room('e2', '2080', 'elevator', 80)]),
    floor(3, [room('e3', '3080', 'elevator', 80), room('o3', '3050', 'office', 30)]),
  ];
  const links = verticalLinksFor(plans);
  const go = (acc: boolean) => calculateIndoorRoute(plans[0], plans[0].rooms[1].coords, 'A', plans[2].rooms[1].coords, 'B', 'o1', 'o3', { isAccessibleOnly: acc, allFloors: plans, startFloor: 1, endFloor: 3, verticalLinks: links });

  it('routes 1 to 3 by changing at floor 2', () => {
    const r = go(false);
    expect(r.steps.filter((s) => s.isVerticalTransition).length).toBe(2);
    expect(r.flaggedNotes?.[0]).toMatch(/change at floor 2/);
    expect(r.steps.map((s) => s.stepNumber)).toEqual(r.steps.map((_, i) => i + 1));
  });

  it('still refuses a step-free route that would need the stairs', () => {
    expect(() => go(true)).toThrow();
  });
});

import { encodeNetwork, decodeNetwork } from '../src/campus/floorImports';

describe('compact network storage', () => {
  it('round-trips nodes, edges, costs and room links', () => {
    const h = [
      { id: 'n0', coords: { x: 10.123, y: 20 }, connectedTo: ['n1', 'roomA'] },
      { id: 'n1', coords: { x: 30, y: 40 }, connectedTo: ['n0', 'n2'], cost: 4 },
      { id: 'n2', coords: { x: 50, y: 60 }, connectedTo: ['n1', 'roomB', 'roomA'] },
    ];
    const back = decodeNetwork(JSON.parse(JSON.stringify(encodeNetwork(h))));
    const norm = (l: typeof h) => l.map((n) => ({ ...n, coords: { x: +n.coords.x.toFixed(2), y: n.coords.y }, connectedTo: [...n.connectedTo].sort() }));
    expect(norm(back as typeof h)).toEqual(norm(h));
  });
});

import { readShaftLinks } from '../src/campus/floorImports';

describe('stairs and elevators linked by hand', () => {
  const room = (id: string, roomNumber: string, category: string, x: number): RoomPOI => ({ id, roomNumber, name: `Room ${roomNumber}`, category, coords: { x, y: 50 } } as RoomPOI);
  const floor = (n: number, rooms: RoomPOI[]): FloorPlanData => ({
    id: `f${n}`, title: '', floorNumber: n, buildingId: 'import-X', buildingName: 'X', buildingType: 'University', summary: '', imageUrl: '',
    rooms, hallways: [{ id: `h${n}`, coords: { x: 50, y: 50 }, connectedTo: rooms.map((r) => r.id) }],
  } as FloorPlanData);
  const plans = [floor(1, [room('a', '1200', 'other', 20), room('o1', '1050', 'office', 70)]), floor(2, [room('b', '2333', 'utility', 80), room('o2', '2050', 'office', 70)])];

  it('joins the chosen rooms as one elevator, whatever they were read as', () => {
    expect(verticalLinksFor(plans)).toEqual([]);
    const links = verticalLinksFor(plans, undefined, [{ id: 'm1', type: 'elevator', rooms: [{ floor: 1, roomId: 'a' }, { floor: 2, roomId: 'b' }] }]);
    expect(links.map((l) => [l.type, l.accessible, l.nodes.map((n) => n.roomId)])).toEqual([['elevator', true, ['a', 'b']]]);
    expect(links[0].description).toMatch(/by hand/);
  });

  it('drops malformed saved links', () => {
    const v = { X: [{ id: 'ok', type: 'stairs', rooms: [{ floor: 1, roomId: 'a' }, { floor: 2, roomId: 'b' }] }, { id: 'bad', type: 'lift', rooms: [] }, { id: 'one', type: 'stairs', rooms: [{ floor: 1, roomId: 'a' }] }], Y: 'nope' };
    expect(readShaftLinks(v)).toEqual({ X: [v.X[0]] });
  });
});

import { stairBoxesFromLayer } from '../src/campus/planGraph';

describe('walls drawn from the PDF wall layer', () => {
  // 300 x 200 box split by a wall drawn as two 1 px lines 5 px apart, with a 30 px doorway.
  const W = 300, H = 200, g = new Uint8Array(W * H).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * W + x] = 0; };
  rect(20, 20, 280, 20); rect(20, 180, 280, 180); rect(20, 20, 20, 180); rect(280, 20, 280, 180);
  for (const x of [148, 154]) { rect(x, 20, x, 90); rect(x, 120, x, 180); }
  const rooms = [{ id: 'A', coords: { x: 25, y: 50 }, category: 'office' }, { id: 'B', coords: { x: 75, y: 50 }, category: 'office' }];
  const pg = buildPlanGraph(g, W, H, rooms, 't', { cleanWalls: true, outsideCloseCells: 4 });

  it('fills the channel inside a wall but keeps the doorway open', () => {
    const { w, cellPx, open } = pg.grid;
    expect(open[Math.floor(50 / cellPx) * w + Math.floor(151 / cellPx)]).toBe(0); // inside the wall
    expect(open[Math.floor(105 / cellPx) * w + Math.floor(151 / cellPx)]).toBe(1); // the doorway
  });

  it('joins both rooms through the doorway', () => {
    const byId = new Map(pg.hallways.map((n) => [n.id, n]));
    const a = pg.hallways.find((n) => n.connectedTo.includes('A'))!, b = pg.hallways.find((n) => n.connectedTo.includes('B'))!;
    const seen = new Set([a.id]), st = [a.id];
    while (st.length) for (const t of byId.get(st.pop()!)!.connectedTo) if (byId.has(t) && !seen.has(t)) { seen.add(t); st.push(t); }
    expect(seen.has(b.id)).toBe(true);
  });

  it('takes stair-layer drawings as stair boxes, but not long thin ones', () => {
    const s = new Uint8Array(W * H).fill(255);
    for (let i = 0; i < 8; i++) for (let y = 40; y <= 70; y++) s[y * W + 60 + i * 5] = 0; // a flight
    for (let x = 100; x <= 290; x++) { s[150 * W + x] = 0; s[160 * W + x] = 0; } // a long thin bridge outline
    expect(stairBoxesFromLayer(s, W, H).length).toBe(1);
  });
});
