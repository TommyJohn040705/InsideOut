import { describe, expect, it } from 'vitest';
import { indoorThroughLinks, type BuildingLink, type IndoorSite } from '../src/campus/tripPlanner';
import type { FloorPlanData } from '../src/types/navigation';

// Two buildings side by side on one floor; image percent maps straight to lng/lat around (0, 0).
const georef = { pctToLngLat: (p: { x: number; y: number }) => [p.x / 1e4, -p.y / 1e4] as [number, number], lngLatToPct: (ll: [number, number]) => ({ x: ll[0] * 1e4, y: -ll[1] * 1e4 }) };
const site = (id: string, x0: number): IndoorSite => {
  const plan = { id, title: id, floorNumber: 1, buildingId: `import-${id}`, buildingType: 'University', aspect: 1, source: 'upload', imageUrl: '',
    rooms: [{ id: `${id}-r`, name: `${id} room`, roomNumber: '101', category: 'office', coords: { x: x0 + 5, y: 52 } }],
    hallways: [{ id: 'h1', coords: { x: x0 + 5, y: 50 }, connectedTo: ['h2', `${id}-r`] }, { id: 'h2', coords: { x: x0 + 45, y: 50 }, connectedTo: ['h1'] }],
  } as unknown as FloorPlanData;
  return { buildingId: id, appBuildingId: `import-${id}`, plans: [plan], georef: () => georef as never, alignment: '' };
};
const sites = { A: site('A', 0), B: site('B', 50) };
const room = (id: string) => ({ ...sites[id as 'A'].plans[0].rooms[0], floor: 1 });

describe('indoor trips through connected buildings', () => {
  const link: BuildingLink = { a: { building: 'A', floor: 1, at: georef.pctToLngLat({ x: 45, y: 50 }) }, b: { building: 'B', floor: 1, at: georef.pctToLngLat({ x: 55, y: 50 }) }, gapM: 1 };

  it('walks through A to the connection and on through B', () => {
    const t = indoorThroughLinks(sites, { buildingId: 'A', room: room('A'), label: 'A' }, { buildingId: 'B', room: room('B'), label: 'B' }, false, [link])!;
    expect(t.legs.map((l) => (l as { buildingId: string }).buildingId)).toEqual(['A', 'B']);
    expect(t.notes[0]).toMatch(/through the connection A–B/);
  });

  it('finds nothing when the buildings are not connected', () => {
    expect(indoorThroughLinks(sites, { buildingId: 'A', room: room('A'), label: 'A' }, { buildingId: 'B', room: room('B'), label: 'B' }, false, [])).toBeNull();
  });
});

describe('longer chains of connections', () => {
  const s4 = { A: site('A', 0), X: site('X', 100), Y: site('Y', 200), B: site('B', 300) };
  const r4 = (id: keyof typeof s4) => ({ ...s4[id].plans[0].rooms[0], floor: 1 });
  const ln = (a: string, ax: number, b: string, bx: number): BuildingLink => ({ a: { building: a, floor: 1, at: georef.pctToLngLat({ x: ax, y: 50 }) }, b: { building: b, floor: 1, at: georef.pctToLngLat({ x: bx, y: 50 }) }, gapM: 1 });
  const chain = [ln('A', 45, 'X', 105), ln('X', 145, 'Y', 205), ln('Y', 245, 'B', 305)];

  it('follows three connections (A–X–Y–B), and every leg starts and ends in its own building', () => {
    const t = indoorThroughLinks(s4, { buildingId: 'A', room: r4('A'), label: 'A' }, { buildingId: 'B', room: r4('B'), label: 'B' }, false, chain)!;
    expect(t.legs.map((l) => (l as { buildingId: string }).buildingId)).toEqual(['A', 'X', 'Y', 'B']);
    // The middle legs' turn-by-turn must use that building's own points, never the trip's start or end room.
    for (const l of t.legs) if (l.kind === 'indoor') {
      expect(l.from.id).not.toBe(l.to.id);
      if (l.buildingId === 'X' || l.buildingId === 'Y') { expect(l.from.name).toMatch(/^Connection to/); expect(l.to.name).toMatch(/^Connection to/); }
    }
    expect(t.outdoorM).toBe(0);
  });

  it('gives up beyond the longest chain allowed', () => {
    const s6 = { ...s4, Z: site('Z', 400), W: site('W', 500), C: site('C', 600) };
    const long = [...chain, ln('B', 345, 'Z', 405), ln('Z', 445, 'W', 505), ln('W', 545, 'C', 605)];
    expect(indoorThroughLinks(s6, { buildingId: 'A', room: r4('A'), label: 'A' }, { buildingId: 'C', room: { ...s6.C.plans[0].rooms[0], floor: 1 }, label: 'C' }, false, long)).toBeNull();
  });
});
