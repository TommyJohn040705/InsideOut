import { describe, expect, it } from 'vitest';
import { bridgeHallwayGaps, GAP_NODE_PREFIX, linkStrandedRooms, STRANDED_LINK_M } from '../src/campus/floorImports';
import { calculateIndoorRoute } from '../src/utils/pathfinding';
import type { FloorPlanData } from '../src/types/navigation';

const hall = [
  { id: 'h1', coords: { x: 10, y: 50 }, connectedTo: ['h2', 'r-linked'] },
  { id: 'h2', coords: { x: 20, y: 50 }, connectedTo: ['h1'] },
];
const room = (id: string, x: number, y: number): { id: string; coords: { x: number; y: number }; navigabilityVerification?: string } => ({ id, coords: { x, y } });

describe('linkStrandedRooms', () => {
  // aspect 1, 1 m per 1% -> the limit is STRANDED_LINK_M percent
  const out = linkStrandedRooms([room('r-linked', 10, 45), room('r-near', 21, 54), room('r-far', 20, 50 + STRANDED_LINK_M + 1)], hall, 1, 1);

  it('joins a stranded room to its nearest hallway point and marks it provisional', () => {
    expect(out.linked).toEqual(['r-near']);
    expect(out.hallways[1].connectedTo).toContain('r-near');
    expect(out.rooms.find((r) => r.id === 'r-near')?.navigabilityVerification).toBe('provisional_corridor_access');
  });

  it('leaves rooms beyond the limit, already-linked rooms and the input arrays alone', () => {
    expect(out.hallways.some((h) => h.connectedTo.includes('r-far'))).toBe(false);
    expect(out.rooms.find((r) => r.id === 'r-linked')).not.toHaveProperty('navigabilityVerification');
    expect(hall[1].connectedTo).toEqual(['h1']);
    expect(out.hallways[0]).toBe(hall[0]);
  });

  it('never joins a room to a stray hallway fragment', () => {
    const withStray = [...hall, { id: 'h3', coords: { x: 40, y: 50 }, connectedTo: [] }];
    const o = linkStrandedRooms([room('r-by-stray', 41, 50)], withStray, 1, 1);
    expect(o.linked).toEqual([]);
  });
});

describe('bridgeHallwayGaps', () => {
  // Two pieces 1.5 m apart (1 m per 1%), a third 10 m away; aspect 1.
  const pieces = [
    { id: 'a1', coords: { x: 10, y: 50 }, connectedTo: ['a2'] },
    { id: 'a2', coords: { x: 20, y: 50 }, connectedTo: ['a1'] },
    { id: 'b1', coords: { x: 21.5, y: 50 }, connectedTo: ['b2'] },
    { id: 'b2', coords: { x: 30, y: 50 }, connectedTo: ['b1'] },
    { id: 'c1', coords: { x: 40, y: 50 }, connectedTo: [] },
  ];
  const out = bridgeHallwayGaps(pieces, 1, 1, 2);

  it('joins pieces closer than the limit through one flagged gap node, and no others', () => {
    expect(out.bridged).toBe(1);
    const gap = out.hallways.find((h) => h.id.startsWith(GAP_NODE_PREFIX))!;
    expect(gap.connectedTo.sort()).toEqual(['a2', 'b1']);
    expect(gap.coords).toEqual({ x: 20.75, y: 50 });
    expect(out.hallways.some((h) => h.connectedTo.includes('c1'))).toBe(false);
  });

  it('a route over the joined gap says so', () => {
    const plan = { id: 'p', title: 'p', floorNumber: 1, buildingType: 'University', aspect: 1, source: 'upload', imageUrl: '',
      rooms: [{ id: 'rA', name: 'Room A', category: 'office', coords: { x: 10, y: 52 } }, { id: 'rB', name: 'Room B', category: 'office', coords: { x: 30, y: 52 } }],
      hallways: out.hallways.map((h) => (h.id === 'a1' ? { ...h, connectedTo: [...h.connectedTo, 'rA'] } : h.id === 'b2' ? { ...h, connectedTo: [...h.connectedTo, 'rB'] } : h)),
    } as unknown as FloorPlanData;
    const r = calculateIndoorRoute(plan, plan.rooms[0].coords, 'Room A', plan.rooms[1].coords, 'Room B', 'rA', 'rB', { allFloors: [plan], startFloor: 1, endFloor: 1, isAccessibleOnly: false });
    expect(r.flaggedNotes?.some((n) => /gap the drawing shows no opening/.test(n))).toBe(true);
  });
});

describe('saved networks keep join marks', () => {
  it('round-trips gap nodes with their cost, without changing the in-room cost', async () => {
    const { encodeNetwork, decodeNetwork } = await import('../src/campus/floorImports');
    const { WALL_CHECKED_GAP_PREFIX } = await import('../src/campus/planGraph');
    const net = [
      { id: 'n0', coords: { x: 1, y: 1 }, connectedTo: [`${WALL_CHECKED_GAP_PREFIX}n1`, 'room-a'], cost: 4 },
      { id: `${WALL_CHECKED_GAP_PREFIX}n1`, coords: { x: 2, y: 1 }, connectedTo: ['n0', 'n2'], cost: 2 },
      { id: 'n2', coords: { x: 3, y: 1 }, connectedTo: [`${WALL_CHECKED_GAP_PREFIX}n1`] },
    ];
    const back = decodeNetwork(JSON.parse(JSON.stringify(encodeNetwork(net))));
    expect(back.map((n) => [n.id, n.cost])).toEqual([['n0', 4], [`${WALL_CHECKED_GAP_PREFIX}n1`, 2], ['n2', undefined]]);
    expect(back[0].connectedTo).toEqual([`${WALL_CHECKED_GAP_PREFIX}n1`, 'room-a']);
  });
});

describe('routes that must go by way of another floor', () => {
  it('goes down one stair and up another when two parts of a floor are only joined below', () => {
    const room = (id: string, x: number, category = 'office') => ({ id, name: id, category, coords: { x, y: 50 } });
    const f1 = { id: 'f1', title: 'f1', floorNumber: 1, buildingType: 'University', aspect: 1, source: 'upload', imageUrl: '',
      rooms: [room('s1', 10, 'stairs'), room('e1', 90, 'elevator')],
      hallways: [{ id: 'a', coords: { x: 10, y: 50 }, connectedTo: ['b', 's1'] }, { id: 'b', coords: { x: 50, y: 50 }, connectedTo: ['a', 'c'] }, { id: 'c', coords: { x: 90, y: 50 }, connectedTo: ['b', 'e1'] }],
    } as unknown as FloorPlanData;
    // Floor 2: a west part (room W, stair) and an east part (room E, elevator) with no hallway between.
    const f2 = { ...f1, id: 'f2', title: 'f2', floorNumber: 2,
      rooms: [room('W', 20), room('s2', 10, 'stairs'), room('E', 80), room('e2', 90, 'elevator')],
      hallways: [{ id: 'w', coords: { x: 15, y: 50 }, connectedTo: ['W', 's2'] }, { id: 'e', coords: { x: 85, y: 50 }, connectedTo: ['E', 'e2'] }],
    } as unknown as FloorPlanData;
    const link = (id: string, type: 'stairs' | 'elevator', r1: string, h1: string, r2: string, h2: string) => ({ id, type, name: id, floorsServed: [1, 2], accessible: type === 'elevator', nodes: [{ floor: 1, roomId: r1, corridorNodeId: h1 }, { floor: 2, roomId: r2, corridorNodeId: h2 }], description: '' });
    const links = [link('stair', 'stairs', 's1', 'a', 's2', 'w'), link('lift', 'elevator', 'e1', 'c', 'e2', 'e')];
    const W = f2.rooms[0], E = f2.rooms[2];
    const r = calculateIndoorRoute(f2, W.coords, 'W', E.coords, 'E', 'W', 'E', { isAccessibleOnly: false, allFloors: [f1, f2], startFloor: 2, endFloor: 2, verticalLinks: links as any });
    expect(r.flaggedNotes?.some((n) => /straight/.test(n))).toBe(false);
    expect(r.flaggedNotes?.[0]).toMatch(/by way of floor 1/);
  });
});
