import { describe, expect, it } from 'vitest';
import { fitGeoref, distanceM, GeorefSource } from '../src/campus/georef';
import { BUILDINGS, INDOOR, ENTRANCES, FOOTPRINTS, coverageSummary, searchBuildings } from '../src/campus/campusData';
import manifest from '../data-sources/wayfinder/uw_floor_plans_manifest.json';
import rooms from '../src/data/e5/rooms.json';

describe('georef', () => {
  it('recovers a known scale, rotation and position exactly', () => {
    // Synthetic frame: 0.05 m/px, +x pointing due east from a known origin.
    const o: [number, number] = [-80.54, 43.47];
    const kx = 111320 * Math.cos((43.47 * Math.PI) / 180);
    const at = (x: number, y: number): [number, number] => [o[0] + (x * 0.05) / kx, o[1] - (y * 0.05) / 110574];
    const src: GeorefSource = {
      buildingId: 'T', floors: [1], imageSize: [1000, 500], method: 'test', review: 'draft_unreviewed',
      controlPoints: [[0, 0], [1000, 0], [1000, 500], [0, 500]].map(([x, y]) => ({ px: [x, y] as [number, number], lngLat: at(x, y), note: '' })),
    };
    const g = fitGeoref(src);
    expect(g.metresPerPixel).toBeCloseTo(0.05, 4);
    expect(g.xAxisBearingDeg).toBeCloseTo(90, 2);
    expect(g.rmsM).toBeLessThan(0.01);
    expect(distanceM(g.pxToLngLat([400, 300]), at(400, 300))).toBeLessThan(0.01);
    const back = g.lngLatToPx(g.pxToLngLat([123, 456]));
    expect(back[0]).toBeCloseTo(123, 3);
    expect(back[1]).toBeCloseTo(456, 3);
  });

  it('E5 draft fit agrees with the drawing scale and stays inside a few metres', () => {
    const g = INDOOR.E5.georef;
    const drawingScale = (0.0254 / 72) * 300 / (3740 / 1224); // 1:300 PDF, tracer px per point
    expect(Math.abs(g.metresPerPixel - drawingScale) / drawingScale).toBeLessThan(0.06);
    expect(g.rmsM).toBeLessThan(4);
    expect(g.xAxisBearingDeg).toBeGreaterThan(130); // +x runs south-south-east along the building
    expect(g.xAxisBearingDeg).toBeLessThan(175);
  });

  it('every E5 room lands within 15 m of the E5 footprint centre line extent', () => {
    const g = INDOOR.E5.georef;
    const e5 = BUILDINGS.find((b) => b.id === 'E5')!;
    for (const r of rooms as any[]) expect(distanceM(g.pctToLngLat(r.coords), e5.center!)).toBeLessThan(75);
  });
});

describe('campus database', () => {
  it('keeps every manifest floor plan, with its restriction flag', () => {
    const floors = new Map(BUILDINGS.flatMap((b) => b.floors).map((f) => [f.filename, f]));
    for (const row of manifest as any[]) {
      const f = floors.get(row.filename);
      expect(f, row.filename).toBeTruthy();
      expect(f!.restricted).toBe(!!row.restricted);
    }
  });

  it('never marks a floor georeferenced without a georeference file', () => {
    for (const b of BUILDINGS) for (const f of b.floors) {
      if (f.status !== 'source_found' && f.status !== 'imported') expect(INDOOR[b.id], `${b.id} ${f.id}`).toBeTruthy();
    }
    expect(coverageSummary().georeferencedFloors).toBe(6);
  });

  it('only has footprints that came from OpenStreetMap', () => {
    const withFootprint = BUILDINGS.filter((b) => b.footprint);
    expect(withFootprint.length).toBe(FOOTPRINTS.features.length);
    for (const b of withFootprint) { expect(b.footprint!.source).toBe('OpenStreetMap'); expect(b.osmIds.length).toBeGreaterThan(0); }
  });

  it('finds buildings by code and name, and E5 has an OSM entrance', () => {
    expect(searchBuildings('e5')[0].id).toBe('E5');
    expect(searchBuildings('davis')[0].code).toBe('DC');
    expect(ENTRANCES.some((e) => e.buildingId === 'E5')).toBe(true);
  });
});
