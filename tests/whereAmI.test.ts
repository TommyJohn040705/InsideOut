import { describe, expect, it } from 'vitest';
import { buildingAt, footprintsOf } from '../src/campus/whereAmI';
import { FOOTPRINTS, buildingById } from '../src/campus/campusData';

const sq = (id: string, x: number): GeoJSON.Feature => ({ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 0.001, 0], [x + 0.001, 0.001], [x, 0.001], [x, 0]]] } });
const fps = footprintsOf({ type: 'FeatureCollection', features: [sq('A', 0), sq('B', 0.002)] });

describe('which building am I in', () => {
  it('inside a footprint', () => expect(buildingAt([0.0005, 0.0005], 20, fps)).toEqual({ id: 'A', inside: true, m: 0 }));
  it('just outside: the nearest one within the GPS accuracy', () => {
    const r = buildingAt([0.00105, 0.0005], 20, fps)!; // ~6 m east of A
    expect(r.id).toBe('A'); expect(r.inside).toBe(false); expect(r.m).toBeLessThan(10);
  });
  it('far from every building: none', () => expect(buildingAt([0.0015, 0.01], 20, fps)).toBeNull());
  it('real campus: the centre of MC is in MC', () => {
    const mc = buildingById('MC')!;
    expect(buildingAt(mc.center as [number, number], 10, footprintsOf(FOOTPRINTS))?.id).toBe('MC');
  });
});
