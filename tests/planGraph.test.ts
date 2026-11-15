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
