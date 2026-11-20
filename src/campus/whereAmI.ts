/** Which campus building a GPS fix is in (or right next to), from the OpenStreetMap footprints. */
import { distanceM, type LngLat } from './georef';

type Ring = LngLat[];
export interface Footprint { id: string; rings: Ring[] }

const inside = (p: LngLat, ring: Ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** Metres from p to the nearest edge of the ring (vertex-and-segment, flat earth). */
const edgeM = (p: LngLat, ring: Ring) => {
  const k = Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((p[0] - a[0]) * k) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, distanceM(p, [a[0] + (b[0] - a[0]) * t, a[1] + dy * t]));
  }
  return best;
};

export function footprintsOf(fc: GeoJSON.FeatureCollection): Footprint[] {
  return fc.features.flatMap((f) => {
    const id = (f.properties as { id?: string } | null)?.id;
    const g = f.geometry;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
    return id && rings.length ? [{ id, rings: rings as Ring[] }] : [];
  });
}

/**
 * The building you are in: the footprint containing the fix; else the nearest one within the fix's
 * accuracy (GPS indoors is often 10-40 m off), capped at 30 m. `inside` says which it was.
 */
export function buildingAt(at: LngLat, accuracyM: number | null, fps: Footprint[]): { id: string; inside: boolean; m: number } | null {
  for (const f of fps) if (f.rings.some((r) => inside(at, r))) return { id: f.id, inside: true, m: 0 };
  const reach = Math.min(30, Math.max(10, accuracyM ?? 15));
  let best: { id: string; inside: boolean; m: number } | null = null;
  for (const f of fps) for (const r of f.rings) { const m = edgeM(at, r); if (m <= reach && (!best || m < best.m)) best = { id: f.id, inside: false, m }; }
  return best;
}
