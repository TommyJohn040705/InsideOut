import { describe, expect, it } from 'vitest';
import pathsJson from '../src/data/campus/paths.json';
import { buildGraph, routeOutdoor, type PathData } from '../src/campus/outdoorRoute';
import { indoorSites, planTrip, doorLinks } from '../src/campus/tripPlanner';
import { entrancesOf } from '../src/campus/campusData';
import { SAMPLE_FLOOR_PLANS } from '../src/data/sampleFloorPlans';
import { distanceM } from '../src/campus/georef';

const g = buildGraph(pathsJson as unknown as PathData);
const sites = indoorSites(SAMPLE_FLOOR_PLANS, []);
const room = (n: string) => { for (const p of SAMPLE_FLOOR_PLANS) for (const r of p.rooms) if (r.roomNumber === n) return { ...r, floor: r.floor ?? p.floorNumber }; throw new Error(n); };

describe('outdoor walking graph', () => {
  it('routes between DC and E5 entrances along mapped paths only', () => {
    const dc = entrancesOf('DC')[0], e5 = entrancesOf('E5')[0];
    const r = routeOutdoor(g, dc, e5)!;
    expect(r).not.toBeNull();
    const straight = distanceM(dc.position, e5.position);
    expect(r.distanceM).toBeGreaterThanOrEqual(straight); // never shorter than the crow flies
    expect(r.distanceM).toBeLessThan(straight * 3);
    // consecutive points are graph edges or the reported connectors, never long jumps
    for (let i = 1; i < r.coords.length; i++) expect(distanceM(r.coords[i - 1], r.coords[i])).toBeLessThan(200);
  });
});

describe('room-to-room trip', () => {
  it('links the E5 OSM entrance to an E5 indoor entrance room', () => {
    const l = doorLinks(sites.E5, 'E5');
    expect(l.length).toBeGreaterThan(0);
    expect(l[0].room.category).toBe('entrance');
  });

  it('plans DC -> E5 3101 as outdoor walk then indoor route ending at 3101', () => {
    const t = planTrip(g, sites, { buildingId: 'DC', label: 'DC' }, { buildingId: 'E5', room: room('3101'), label: 'E5 3101' }, false);
    if ('error' in t) throw new Error(t.error);
    expect(t.legs.map((l) => l.kind)).toEqual(['outdoor', 'indoor']);
    const indoor = t.legs[1];
    if (indoor.kind !== 'indoor') throw new Error();
    expect(indoor.route.toFloor).toBe(3);
    expect(indoor.route.steps.some((s) => s.isVerticalTransition)).toBe(true);
    expect(t.notes.join(' ')).toMatch(/not been walked/);
  });

  it('refuses multi-floor routes in buildings with no mapped stairs or elevators', () => {
    // E5's floors without their stairs and elevators: nothing joins the two floors.
    const fake = SAMPLE_FLOOR_PLANS.slice(0, 2).map((p) => ({ ...p, buildingId: 'import-X', rooms: p.rooms.filter((r) => r.category !== 'elevator' && r.category !== 'stairs') }));
    const s = { X: { buildingId: 'X', appBuildingId: 'import-X', plans: fake, georef: () => null, alignment: '' } };
    const a = { ...fake[0].rooms[0], floor: fake[0].floorNumber }, b = { ...fake[1].rooms[0], floor: fake[1].floorNumber };
    const t = planTrip(g, s, { buildingId: 'X', room: a, label: 'a' }, { buildingId: 'X', room: b, label: 'b' }, false);
    expect('error' in t).toBe(true);
  });
});
