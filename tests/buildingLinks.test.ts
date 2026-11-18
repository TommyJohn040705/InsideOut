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
