import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { graphProblems, importStatus, importToPlan, type FloorImport } from '../src/campus/floorImports';
import { openStore } from '../server/store';
import e5 from '../src/data/campus/georef/E5.json';

const base: FloorImport = {
  id: 'T-01-x', buildingId: 'DC', floorCode: '01', floorNumber: 1, manifestFilename: null, restricted: false, authorization: 'test',
  sourceName: 'a.pdf', sourceMime: 'application/pdf', fileUrl: '/uploads/a.pdf', imageUrl: '/uploads/a.png', imageSize: [3067, 992],
  uploadedAt: '', pdfLabels: [], extraction: null, rooms: [], hallways: [], controlPoints: [], reviewed: false, published: false,
};
const room = (id: string) => ({ id, name: id, category: 'office' as const, coords: { x: 10, y: 10 } });

describe('import status follows what the record holds', () => {
  it('climbs only as data is added, and never claims a walked route', () => {
    expect(importStatus(base)).toBe('imported');
    const withRooms = { ...base, rooms: [room('a'), room('b')] };
    expect(importStatus(withRooms)).toBe('geometry_extracted');
    const aligned = { ...withRooms, controlPoints: e5.controlPoints as FloorImport['controlPoints'] };
    expect(importStatus(aligned)).toBe('georeferenced');
    expect(importStatus({ ...aligned, reviewed: true })).toBe('human_reviewed'); // no hallways yet
    const routed = { ...aligned, reviewed: true, hallways: [{ id: 'h1', coords: { x: 1, y: 1 }, connectedTo: ['a', 'h2'] }, { id: 'h2', coords: { x: 2, y: 2 }, connectedTo: ['b'] }] };
    expect(graphProblems(routed.rooms, routed.hallways)).toEqual([]);
    expect(importStatus(routed)).toBe('routing_available');
  });

  it('reports disconnected hallways and unlinked rooms', () => {
    const p = graphProblems([room('a'), room('z')], [{ id: 'h1', coords: { x: 1, y: 1 }, connectedTo: ['a'] }, { id: 'h2', coords: { x: 2, y: 2 }, connectedTo: [] }]);
    expect(p.join(' ')).toMatch(/1 hallway nodes are not connected/);
    expect(p.join(' ')).toMatch(/1 rooms have no hallway connection/);
  });

  it('becomes an indoor floor of its own import-<building>', () => {
    const plan = importToPlan({ ...base, rooms: [room('a')] }, 'Davis Centre');
    expect(plan.buildingId).toBe('import-DC');
    expect(plan.rooms[0].floor).toBe(1);
  });
});

describe('server store', () => {
  it('persists imports and uploads across reopen, and deletes uploads', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insideout-store-'));
    const s = openStore(dir);
    const up = s.saveUpload('x', 'data:image/png;base64,iVBORw0KGgo=');
    s.update((d) => { d.floorImports.push(base); d.kv.corrections = [{ id: 'c1' }]; });
    const again = openStore(dir).read();
    expect(again.floorImports[0].id).toBe('T-01-x');
    expect(again.kv.corrections).toEqual([{ id: 'c1' }]);
    expect(fs.existsSync(path.join(dir, 'uploads', up.name))).toBe(true);
    s.removeUpload(up.name);
    expect(fs.existsSync(path.join(dir, 'uploads', up.name))).toBe(false);
    expect(() => s.saveUpload('y', 'data:text/html;base64,PGI+')).toThrow(/Unsupported/);
    fs.writeFileSync(path.join(dir, 'store.json'), '{broken');
    expect(() => openStore(dir).read()).toThrow(); // a corrupt store is never silently emptied
  });
});

describe('imported floors never route through walls', () => {
  it('drops hallways until the floor is reviewed and connected, and routing then refuses', async () => {
    const { calculateIndoorRoute } = await import('../src/utils/pathfinding');
    const rec = { ...base, rooms: [room('a'), { ...room('b'), coords: { x: 80, y: 80 } }], hallways: [{ id: 'h1', coords: { x: 1, y: 1 }, connectedTo: ['a', 'b'] }], controlPoints: e5.controlPoints as FloorImport['controlPoints'] };
    const plan = importToPlan(rec, 'Davis Centre'); // not reviewed
    expect(plan.hallways).toEqual([]);
    expect(() => calculateIndoorRoute(plan, plan.rooms[0].coords, 'a', plan.rooms[1].coords, 'b', 'a', 'b')).toThrow(/No hallway network/);
    expect(importToPlan({ ...rec, reviewed: true }, 'Davis Centre').hallways).toHaveLength(1);
  });
});

describe('drawn imported buildings route between floors', () => {
  it('matches elevators by room number and routes floor 1 -> floor 2', async () => {
    const { calculateIndoorRoute } = await import('../src/utils/pathfinding');
    const { verticalLinksFor } = await import('../src/campus/floorImports');
    const floor = (n: number) => importToPlan({
      ...base, id: `T-0${n}`, floorNumber: n, floorCode: `0${n}`, reviewed: true, controlPoints: e5.controlPoints as FloorImport['controlPoints'],
      rooms: [{ id: `r${n}a`, name: 'Office', roomNumber: `${n}101`, category: 'office', coords: { x: 10, y: 50 } }, { id: `r${n}e`, name: 'Elevator', roomNumber: `${n}801`, category: 'elevator', coords: { x: 90, y: 50 } }],
      hallways: [{ id: `h${n}1`, coords: { x: 10, y: 55 }, connectedTo: [`h${n}2`, `r${n}a`] }, { id: `h${n}2`, coords: { x: 90, y: 55 }, connectedTo: [`h${n}1`, `r${n}e`] }],
    }, 'Test');
    const plans = [floor(1), floor(2)];
    const links = verticalLinksFor(plans);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ type: 'elevator', floorsServed: [1, 2], accessible: true });
    const a = plans[0].rooms[0], b = plans[1].rooms[0];
    const r = calculateIndoorRoute(plans[0], a.coords, a.name, b.coords, b.name, a.id, b.id, { allFloors: plans, startFloor: 1, endFloor: 2, verticalLinks: links });
    expect(r.fromFloor).toBe(1);
    expect(r.toFloor).toBe(2);
    expect(r.steps.some((s) => s.isVerticalTransition)).toBe(true);
  });
});
