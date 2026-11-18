/**
 * Finds where neighbouring buildings connect indoors (bridges, tunnels, link corridors): on each
 * pair of floors of two buildings whose footprints touch, the traced hallways of one come within
 * GAP_M of the other's at the shared edge. Writes src/data/campus/buildingLinks.json, which the
 * trip planner uses to stay indoors between connected buildings. Read off placed drawings, so
 * every link is a draft: not walked. Run after placements change:
 *   npx tsx scripts/campus/findConnections.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { decodeNetwork, georefOfImport, importToPlan, type FloorImport } from '../../src/campus/floorImports';
import type { LngLat } from '../../src/campus/georef';
import footprints from '../../src/data/campus/footprints.json';

/** Furthest apart two buildings' hallway points may be to count as connected (m). */
const GAP_M = 4;
/** How close to the other building's footprint a hallway point must be (m): links are at the shared edge. */
const EDGE_M = 6;
const OUT = 'src/data/campus/buildingLinks.json';

const s = JSON.parse(readFileSync('data/store.json', 'utf8')) as { floorImports: FloorImport[] };
const imports = s.floorImports.filter((f) => f.published && f.rooms.length && georefOfImport(f));
for (const f of imports) { const p = `data/networks/${f.id.replace(/[^\w-]/g, '_')}.json`; if (existsSync(p)) f.autoHallways = decodeNetwork(JSON.parse(readFileSync(p, 'utf8'))); }
const lat0 = 43.47, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
const toM = (ll: LngLat) => [ll[0] * kx, ll[1] * ky];
const ringOf = (b: string): number[][][] | null => {
  const f = (footprints as any).features.find((x: any) => x.properties.code === b);
  if (!f) return null;
  return (f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p: LngLat[][]) => p[0])).map((r: LngLat[]) => r.map(toM));
};
const segDist = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const inPoly = (x: number, y: number, r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const distToFoot = (p: number[], rings: number[][][]) => (rings.some((r) => inPoly(p[0], p[1], r)) ? 0 : Math.min(...rings.flatMap((r) => r.slice(1).map((q, i) => segDist(p, r[i], q)))));

// Every floor's hallway points in metres.
type Pt = { m: number[]; ll: LngLat };
const floors = imports.map((f) => {
  const g = georefOfImport(f)!, plan = importToPlan(f, f.buildingId, imports.filter((x) => x.buildingId === f.buildingId));
  return { f, pts: plan.hallways.filter((h) => !h.id.startsWith('gap')).map((h) => { const ll = g.pctToLngLat(h.coords); return { m: toM(ll), ll: [+ll[0].toFixed(7), +ll[1].toFixed(7)] as LngLat }; }) as Pt[] };
});
const buildings = [...new Set(floors.map((x) => x.f.buildingId))];
const rings = new Map(buildings.map((b) => [b, ringOf(b)]));
// Positions are map coordinates, so a link works for any indoor map of the building (an import or E5's traced drawings).
const links: { a: { building: string; floor: number; at: LngLat }; b: { building: string; floor: number; at: LngLat }; gapM: number }[] = [];
for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
  const A = buildings[i], B = buildings[j], rA = rings.get(A), rB = rings.get(B);
  if (!rA || !rB) continue;
  // Footprints must nearly touch.
  if (Math.min(...rA.flat().map((p) => distToFoot(p, rB))) > EDGE_M * 2) continue;
  for (const fa of floors.filter((x) => x.f.buildingId === A)) for (const fb of floors.filter((x) => x.f.buildingId === B)) {
    if (Math.abs(fa.f.floorNumber - fb.f.floorNumber) > 1) continue;
    const ea = fa.pts.filter((p) => distToFoot(p.m, rB) <= EDGE_M), eb = fb.pts.filter((p) => distToFoot(p.m, rA) <= EDGE_M);
    let best: { pa: Pt; pb: Pt; d: number } | null = null;
    for (const pa of ea) for (const pb of eb) { const d = Math.hypot(pa.m[0] - pb.m[0], pa.m[1] - pb.m[1]); if (d <= GAP_M && (!best || d < best.d)) best = { pa, pb, d }; }
    if (best) links.push({ a: { building: A, floor: fa.f.floorNumber, at: best.pa.ll }, b: { building: B, floor: fb.f.floorNumber, at: best.pb.ll }, gapM: +best.d.toFixed(1) });
  }
}
// Same floor numbers first; keep the closest link per pair of floors.
links.sort((x, y) => Math.abs(x.a.floor - x.b.floor) - Math.abs(y.a.floor - y.b.floor) || x.gapM - y.gapM);
const seen = new Set<string>(), kept = links.filter((l) => { const k = `${l.a.building}|${l.a.floor}|${l.b.building}`, k2 = `${l.a.building}|${l.b.building}|${l.b.floor}`; if (seen.has(k) || seen.has(k2)) return false; seen.add(k); seen.add(k2); return true; });
writeFileSync(OUT, JSON.stringify(kept, null, 1));
const pairs = [...new Set(kept.map((l) => `${l.a.building}-${l.b.building}`))];
console.log(`${kept.length} links between ${pairs.length} pairs of buildings:`);
for (const p of pairs) console.log(`  ${p}: floors ${kept.filter((l) => `${l.a.building}-${l.b.building}` === p).map((l) => (l.a.floor === l.b.floor ? `${l.a.floor}` : `${l.a.floor}/${l.b.floor}`) + ` (${l.gapM} m)`).join(', ')}`);
