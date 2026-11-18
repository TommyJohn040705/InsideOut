/**
 * Adds the University of Waterloo campus GIS's own building connections (GIS_MAINBUILDING_LINKS and
 * GIS_PEDESTRIAN_TUNNELS, with their name labels, e.g. "LINK - DC TO MC", "PEDESTRIAN TUNNEL TC TO
 * AL") to src/data/campus/buildingLinks.json. For each named pair the link outline between the two
 * footprints is found, and on each side the floor whose traced hallway runs into the outline (the floor
 * whose drawing shows the bridge or tunnel); tunnels fall back to the lowest floor, links to floor 1.
 * Only the derived connections are stored, not the GIS files. Usage:
 *   npx tsx scripts/campus/gisLinks.ts <folder with the extracted Polygons/ shapefiles>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readShapefile, type LngLat } from './uwGis';
import { decodeNetwork, georefOfImport, importToPlan, type FloorImport } from '../../src/campus/floorImports';
import footprints from '../../src/data/campus/footprints.json';

const dir = process.argv[2];
if (!dir) throw new Error('usage: gisLinks.ts <folder containing Polygons/>');
const OUT = 'src/data/campus/buildingLinks.json';
/** How far a link outline may be from each building's footprint (m), and from a hallway end (m). */
const TOUCH_M = 12, END_M = 12;

const kx = 111320 * Math.cos((43.47 * Math.PI) / 180), toM = (p: LngLat) => [p[0] * kx, p[1] * 111320];
const segD = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const inPoly = (p: number[], r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const distPolys = (p: number[], rings: number[][][]) => (rings.some((r) => inPoly(p, r)) ? 0 : Math.min(...rings.flatMap((r) => r.slice(1).map((q, i) => segD(p, r[i], q)))));
const footOf = (b: string) => { const f = (footprints as any).features.find((x: any) => x.properties.code === b); return f ? (f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p: LngLat[][]) => p[0])).map((r: LngLat[]) => r.map(toM)) as number[][][] : null; };

// Named pairs from the label layers.
const label = (s: string) => s.replace(/\\P/g, ' ').replace(/\s+/g, ' ').trim();
const FIX: Record<string, string> = { HY: 'PHY', AC: 'PAC' }; // labels cut off by the drawing's text box
const pairsFrom = (layer: string, kind: 'link' | 'tunnel') => readShapefile(`${dir}/Polygons/${layer}`).flatMap((s) => {
  const m = label(String(s.attrs.BLDG_NAME)).match(/([A-Z0-9]+)\s+TO\s+([A-Z0-9/ ]+)$/);
  if (!m) return [];
  const a = FIX[m[1]] || m[1];
  return m[2].split('/').map((x) => FIX[x.trim()] || x.trim()).map((b) => ({ a, b, kind, name: label(String(s.attrs.BLDG_NAME)) }));
});
const pairs = [...pairsFrom('GIS_MAINBUILDING_LINKS_TAG', 'link'), ...pairsFrom('GIS_PEDESTRIAN_TUNNELS_LINK', 'tunnel')];
const outlines = { link: readShapefile(`${dir}/Polygons/GIS_MAINBUILDING_LINKS`), tunnel: readShapefile(`${dir}/Polygons/GIS_PEDESTRIAN_TUNNELS`) };

// Every placed floor's traced hallway points, in metres.
const s = JSON.parse(readFileSync('data/store.json', 'utf8')) as { floorImports: FloorImport[] };
const imports = s.floorImports.filter((f) => f.published && f.rooms.length && georefOfImport(f));
for (const f of imports) { const p = `data/networks/${f.id.replace(/[^\w-]/g, '_')}.json`; if (existsSync(p)) f.autoHallways = decodeNetwork(JSON.parse(readFileSync(p, 'utf8'))); }
const floorsOf = (b: string) => imports.filter((f) => f.buildingId === b).map((f) => {
  const g = georefOfImport(f)!, plan = importToPlan(f, b, imports.filter((x) => x.buildingId === b));
  // Only the floor's main hallway network: a link on a cut-off piece leaves every trip a straight line.
  const hs = plan.hallways, idx = new Map(hs.map((h, i) => [h.id, i])), par = hs.map((_, i) => i);
  const root = (i: number): number => (par[i] === i ? i : (par[i] = root(par[i])));
  hs.forEach((h, i) => h.connectedTo.forEach((t) => { const j = idx.get(t); if (j !== undefined) par[root(i)] = root(j); }));
  const size = new Map<number, number>(); hs.forEach((_, i) => size.set(root(i), (size.get(root(i)) || 0) + 1));
  const main = [...size].sort((x, y) => y[1] - x[1])[0]?.[0];
  return { floor: f.floorNumber, pts: hs.filter((h, i) => !h.id.startsWith('gap') && root(i) === main).map((h) => { const ll = g.pctToLngLat(h.coords); return { m: toM(ll), ll }; }) };
});

const existing = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as any[]).filter((l) => l.source !== 'UW campus GIS') : [];
const added: any[] = [], missed: string[] = [];
for (const p of pairs) {
  const fa = footOf(p.a), fb = footOf(p.b);
  if (!fa || !fb) { missed.push(`${p.name}: ${!fa ? p.a : p.b} not in the campus building list`); continue; }
  const shape = outlines[p.kind].find((o) => o.parts.some((r) => r.map(toM).some((q) => distPolys(q, fa) <= TOUCH_M)) && o.parts.some((r) => r.map(toM).some((q) => distPolys(q, fb) <= TOUCH_M)));
  if (!shape) { missed.push(`${p.name}: no outline between ${p.a} and ${p.b}`); continue; }
  const ring = shape.parts.flat().map(toM);
  const endNear = (foot: number[][][]) => ring.reduce((best, q) => (distPolys(q, foot) < distPolys(best, foot) ? q : best));
  const ea = endNear(fa), eb = endNear(fb), length = Math.hypot(ea[0] - eb[0], ea[1] - eb[1]);
  // On each side: the floor whose hallway runs furthest into the outline, else the floor nearest its end.
  const pick = (b: string, end: number[]) => {
    const fl = floorsOf(b); if (!fl.length) return null;
    const scored = fl.map((f) => {
      const inside = f.pts.filter((q) => [shape.parts.map((r) => r.map(toM))].flat().some((r) => inPoly(q.m, r))).length;
      const near = f.pts.reduce((best, q) => { const d = Math.hypot(q.m[0] - end[0], q.m[1] - end[1]); return d < best.d ? { d, q } : best; }, { d: Infinity, q: f.pts[0] });
      return { floor: f.floor, inside, near };
    }).filter((x) => x.near.q && x.near.d <= END_M);
    if (!scored.length) return null;
    const drawn = scored.filter((x) => x.inside > 0).sort((x, y) => y.inside - x.inside)[0];
    const fallback = scored.sort((x, y) => (p.kind === 'tunnel' ? x.floor - y.floor : Math.abs(x.floor - 1) - Math.abs(y.floor - 1)) || x.near.d - y.near.d)[0];
    const c = drawn || fallback;
    return { floor: c.floor, at: [+c.near.q.ll[0].toFixed(7), +c.near.q.ll[1].toFixed(7)] as LngLat, drawn: !!drawn };
  };
  const A = pick(p.a, ea), B = pick(p.b, eb);
  if (!A || !B) { missed.push(`${p.name}: no traced hallway near the ${!A ? p.a : p.b} end`); continue; }
  added.push({ a: { building: p.a, floor: A.floor, at: A.at }, b: { building: p.b, floor: B.floor, at: B.at }, gapM: +length.toFixed(1), source: 'UW campus GIS', kind: p.kind, name: p.name, floorsFrom: A.drawn && B.drawn ? 'drawings' : 'estimate' });
}
// An automatic link for a pair the GIS also names is replaced by the GIS one.
const named = new Set(added.flatMap((l) => [`${l.a.building}|${l.b.building}`, `${l.b.building}|${l.a.building}`]));
const kept = existing.filter((l) => !named.has(`${l.a.building}|${l.b.building}`));
writeFileSync(OUT, JSON.stringify([...kept, ...added], null, 1));
console.log(`${added.length} official connections added, ${kept.length} automatic ones kept:`);
for (const l of added) console.log(`  ${l.kind} ${l.a.building} ${l.a.floor} - ${l.b.building} ${l.b.floor}: ${l.gapM} m (floors from ${l.floorsFrom})`);
if (missed.length) console.log(`not added:\n  ${missed.join('\n  ')}`);
