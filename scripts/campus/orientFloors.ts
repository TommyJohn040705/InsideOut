/**
 * Settles "orientation uncertain" (the outline fits almost as well turned 180 degrees). For each
 * building, the placement as it is and turned 180 degrees about the floor's centre are compared on
 * two pieces of evidence: how well the floor's clean outline (styledPlan.ts picture) covers the
 * OpenStreetMap footprint, and how close the drawing's entrance rooms land to OSM's mapped entrances.
 * Clear results are saved (turning every floor of the building together); unclear ones keep the
 * warning. Drafts only, nothing is marked reviewed. Through the server:
 *   INSIDEOUT_URL=http://localhost:3001 npx tsx scripts/campus/orientFloors.ts [--save] BUILDING ...
 */
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import type { LngLat } from '../../src/campus/georef';
import footprints from '../../src/data/campus/footprints.json';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const save = process.argv.includes('--save');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// --eye=turn|keep: decided by looking at the sheet's north arrow and key map against the map.
const eye = process.argv.find((a) => a.startsWith('--eye='))?.slice(6) as 'turn' | 'keep' | undefined;
const REG = JSON.parse(readFileSync('src/data/campus/floorRegistration.json', 'utf8')) as Record<string, { ref: string }>;
const ENTS = (JSON.parse(readFileSync('src/data/campus/entrances.json', 'utf8')) as { buildingId: string; position: LngLat }[]);
/** Outline overlap or entrance distance gap that counts as a clear answer. */
const IOU_CLEAR = 0.03, ENT_CLEAR_M = 4;

async function get(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, headers: { ...(init?.headers || {}), Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}
const inPoly = (x: number, y: number, ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

const all: FloorImport[] = await (await get(`${BASE}/api/floor-imports`)).json();
for (const b of only) {
  const floors = all.filter((f) => f.buildingId === b && georefOfImport(f));
  const feat = (footprints as any).features.find((x: any) => x.properties.code === b);
  // The floor the others are stacked on by their walls, so the whole building turns together.
  const refId = floors.map((f) => REG[f.id]?.ref).find(Boolean);
  const ref = floors.find((f) => f.id === refId && f.styledImageUrl) || floors.filter((f) => f.styledImageUrl).sort((a, z) => z.rooms.length - a.rooms.length)[0];
  if (!ref || !feat) { console.log(`${b}: no floor picture or footprint`); continue; }
  const g0 = georefOfImport(ref)!;
  const rings: LngLat[][] = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates[0]] : feat.geometry.coordinates.map((p: LngLat[][]) => p[0]);
  const P = rings.flat(), lng0 = P.reduce((s, p) => s + p[0], 0) / P.length, lat0 = P.reduce((s, p) => s + p[1], 0) / P.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
  const toM = (ll: LngLat) => [(ll[0] - lng0) * kx, (ll[1] - lat0) * ky];
  const fromM = ([x, y]: number[]): LngLat => [lng0 + x / kx, lat0 + y / ky];
  const ringsM = rings.map((r) => r.map(toM));
  const xs = ringsM.flat().map((p) => p[0]), ys = ringsM.flat().map((p) => p[1]);
  const C = 0.5, fx0 = Math.min(...xs) - 40, fy0 = Math.min(...ys) - 40, FW = Math.ceil((Math.max(...xs) + 40 - fx0) / C), FH = Math.ceil((Math.max(...ys) + 40 - fy0) / C);
  const foot = new Uint8Array(FW * FH); let footN = 0;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) if (ringsM.some((r) => inPoly(fx0 + (i + 0.5) * C, fy0 + (j + 0.5) * C, r))) { foot[j * FW + i] = 1; footN++; }
  const img = await loadImage(Buffer.from(await (await get(`${BASE}${ref.styledImageUrl}`)).arrayBuffer()));
  const cv = createCanvas(img.width, img.height), g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data, step = Math.max(4, Math.round(Math.sqrt((img.width * img.height) / 40000)));
  const sample: number[][] = [];
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) if (d[(y * img.width + x) * 4 + 3]) sample.push(toM(g0.pxToLngLat([x, y])));
  if (sample.length < 50) { console.log(`${b}: outline too small`); continue; }
  const cx = sample.reduce((s, p) => s + p[0], 0) / sample.length, cy = sample.reduce((s, p) => s + p[1], 0) / sample.length;
  // A correction in local metres: turn by t degrees about the floor's centre, then shift.
  const move = (p: number[], t: number, dx: number, dy: number) => { const a = (t * Math.PI) / 180, X = p[0] - cx, Y = p[1] - cy; return [cx + dx + X * Math.cos(a) - Y * Math.sin(a), cy + dy + X * Math.sin(a) + Y * Math.cos(a)]; };
  const cover = (t: number, dx: number, dy: number) => {
    let hit = 0;
    for (const p of sample) { const [x, y] = move(p, t, dx, dy); const i = Math.floor((x - fx0) / C), j = Math.floor((y - fy0) / C); if (i >= 0 && j >= 0 && i < FW && j < FH && foot[j * FW + i]) hit++; }
    const area = (step * g0.metresPerPixel) ** 2, inter = hit * area;
    return inter / (sample.length * area + footN * C * C - inter);
  };
  const fit = (t0: number) => {
    let best = { v: cover(t0, 0, 0), t: t0, dx: 0, dy: 0 };
    for (const st of [4, 2, 1, 0.5]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const [dt, ddx, ddy] of [[st / 2, 0, 0], [-st / 2, 0, 0], [0, st, 0], [0, -st, 0], [0, 0, st], [0, 0, -st]]) {
          const n = { t: best.t + dt, dx: best.dx + ddx, dy: best.dy + ddy };
          if (Math.abs(n.t - t0) > 3 || Math.hypot(n.dx, n.dy) > 12) continue;
          const v = cover(n.t, n.dx, n.dy);
          if (v > best.v + 1e-4) { best = { v, ...n }; improved = true; }
        }
      }
    }
    return best;
  };
  const as = fit(0), turned = fit(180);
  // Entrance rooms on every floor vs OSM entrances.
  const ents = ENTS.filter((e) => e.buildingId === b).map((e) => toM(e.position));
  const doors = floors.flatMap((f) => f.rooms.filter((r) => r.category === 'entrance' || r.category === 'exit').map((r) => toM(georefOfImport(f)!.pctToLngLat(r.coords))));
  const entDist = (c: { t: number; dx: number; dy: number }) => (ents.length && doors.length ? doors.reduce((s, p) => { const q = move(p, c.t, c.dx, c.dy); return s + Math.min(...ents.map((e) => Math.hypot(e[0] - q[0], e[1] - q[1]))); }, 0) / doors.length : NaN);
  const eA = entDist(as), eT = entDist(turned);
  const iouGap = turned.v - as.v, entGap = Number.isNaN(eA) ? 0 : eA - eT; // positive: turned is better
  // Barely on its footprint either way: the placement is wrong, not just the turn. Leave it flagged.
  const verdict = eye ? eye : Math.max(as.v, turned.v) < 0.5 ? 'unclear' : (iouGap > IOU_CLEAR && entGap > -2) || (entGap > ENT_CLEAR_M && iouGap > -0.02) ? 'turn'
    : (iouGap < -IOU_CLEAR && entGap < 2) || (entGap < -ENT_CLEAR_M && iouGap < 0.02) ? 'keep' : 'unclear';
  const evidence = `${eye ? "the sheet's north arrow and key map; " : ''}outline ${(as.v * 100).toFixed(0)}% as placed vs ${(turned.v * 100).toFixed(0)}% turned${Number.isNaN(eA) ? '' : `, entrances ${eA.toFixed(1)} m vs ${eT.toFixed(1)} m (${doors.length} on the drawing, ${ents.length} in OSM)`}`;
  console.log(`${b}: ${evidence} -> ${verdict}`);
  if (!save) continue;
  const chosen = verdict === 'turn' ? turned : null;
  for (const f of floors) {
    const gf = georefOfImport(f)!, [w, h] = f.imageSize;
    const controlPoints = chosen ? ([[0, 0], [w, 0], [w, h], [0, h]] as [number, number][]).map((px) => ({ px, lngLat: fromM(move(toM(gf.pxToLngLat(px)), chosen.t, chosen.dx, chosen.dy)), note: `Turned 180 degrees: ${evidence}. Draft: not surveyed.` })) : f.controlPoints;
    const base = (f.alignmentFrom || 'auto:outline').replace(/^auto\?:/, 'auto:').replace(/, orientation .*$/, '');
    const alignmentFrom = verdict === 'unclear' ? base.replace(/^auto:/, 'auto?:') : `${base}, orientation checked (${verdict === 'turn' ? 'turned 180' : 'kept'}): ${evidence}`;
    const r = await get(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ controlPoints, alignmentFrom }) });
    if (!r.ok) console.log(`  ${f.id}: save failed ${r.status}`);
  }
}
