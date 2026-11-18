/**
 * Fits each building's floors snugly onto its OpenStreetMap outline. Per building, the reference
 * floor (the one the others are lined up against, src/data/campus/floorRegistration.json) is nudged
 * - turned up to 6 degrees, scaled up to 8%, moved up to 15 m - until its clean outline (the
 * transparent-outside picture from styledPlan.ts) overlaps the OSM footprint best. Every other floor
 * then takes its position from the reference through the wall registration, so floors stack exactly.
 * Only clear improvements are saved, as draft alignments (not reviewed). Through the server:
 *   INSIDEOUT_URL=http://localhost:3001 npx tsx scripts/campus/refitFloors.ts [--save] [BUILDING ...]
 */
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import { applyAffine, type Affine } from '../../src/campus/floorRegister';
import type { LngLat } from '../../src/campus/georef';
import footprints from '../../src/data/campus/footprints.json';
import { autoAlign } from '../../src/campus/autoAlign';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const save = process.argv.includes('--save');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const REG = JSON.parse(readFileSync('src/data/campus/floorRegistration.json', 'utf8')) as Record<string, { ref: string; m: Affine }>;
const MAX_TURN = 6, MAX_SCALE = 0.08, MAX_SHIFT = 15, MIN_GAIN = 0.02;

async function get(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, headers: { ...(init?.headers || {}), Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}
const inPoly = (x: number, y: number, ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

const all: FloorImport[] = await (await get(`${BASE}/api/floor-imports`)).json();
let changed = 0, kept = 0;
for (const b of [...new Set(all.map((f) => f.buildingId))]) {
  if (only.length && !only.includes(b)) continue;
  const floors = all.filter((f) => f.buildingId === b && f.styledImageUrl);
  const refId = floors.map((f) => REG[f.id]?.ref).find(Boolean) || floors.filter(georefOfImport).sort((a, z) => z.rooms.length - a.rooms.length)[0]?.id;
  const ref = floors.find((f) => f.id === refId);
  const feat = (footprints as any).features.find((x: any) => x.properties.code === b);
  const g0 = ref && georefOfImport(ref);
  if (!ref || !g0 || !feat) continue;
  const rings: LngLat[][] = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates[0]] : feat.geometry.coordinates.map((p: LngLat[][]) => p[0]);
  // Local metres around the footprint.
  const pts = rings.flat(), lng0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
  const toM = (ll: LngLat) => [(ll[0] - lng0) * kx, (ll[1] - lat0) * ky];
  const fromM = ([x, y]: number[]): LngLat => [lng0 + x / kx, lat0 + y / ky];
  const ringsM = rings.map((r) => r.map(toM));
  // Footprint raster, 0.5 m cells.
  const xs = ringsM.flat().map((p) => p[0]), ys = ringsM.flat().map((p) => p[1]);
  const fx0 = Math.min(...xs) - 30, fy0 = Math.min(...ys) - 30, C = 0.5, FW = Math.ceil((Math.max(...xs) + 30 - fx0) / C), FH = Math.ceil((Math.max(...ys) + 30 - fy0) / C);
  const foot = new Uint8Array(FW * FH); let footN = 0;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) if (ringsM.some((r) => inPoly(fx0 + (i + 0.5) * C, fy0 + (j + 0.5) * C, r))) { foot[j * FW + i] = 1; footN++; }
  // Reference floor outline: opaque pixels of its clean picture, sampled.
  const img = await loadImage(Buffer.from(await (await get(`${BASE}${ref.styledImageUrl}`)).arrayBuffer()));
  const c = createCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data, step = Math.max(4, Math.round(Math.sqrt((img.width * img.height) / 40000)));
  const sample: number[][] = [];
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) if (d[(y * img.width + x) * 4 + 3]) sample.push(toM(g0.pxToLngLat([x, y])));
  if (sample.length < 50) continue;
  const areaPer = (step * g0.metresPerPixel) ** 2;
  const [cx, cy] = [sample.reduce((s, p) => s + p[0], 0) / sample.length, sample.reduce((s, p) => s + p[1], 0) / sample.length];
  const move = (p: number[], t: number, s: number, dx: number, dy: number) => { const a = (t * Math.PI) / 180, X = p[0] - cx, Y = p[1] - cy; return [cx + dx + s * (X * Math.cos(a) - Y * Math.sin(a)), cy + dy + s * (X * Math.sin(a) + Y * Math.cos(a))]; };
  const iou = (t: number, s: number, dx: number, dy: number) => {
    let hit = 0;
    for (const p of sample) { const [x, y] = move(p, t, s, dx, dy); const i = Math.floor((x - fx0) / C), j = Math.floor((y - fy0) / C); if (i >= 0 && j >= 0 && i < FW && j < FH && foot[j * FW + i]) hit++; }
    const inter = hit * areaPer * s * s;
    return inter / (sample.length * areaPer * s * s + footN * C * C - inter);
  };
  const before = iou(0, 1, 0, 0);
  let best = { v: before, t: 0, s: 1, dx: 0, dy: 0 };
  for (const st of [4, 2, 1, 0.5, 0.25]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dt, ds, ddx, ddy] of [[st, 0, 0, 0], [-st, 0, 0, 0], [0, 0.01 * st, 0, 0], [0, -0.01 * st, 0, 0], [0, 0, st, 0], [0, 0, -st, 0], [0, 0, 0, st], [0, 0, 0, -st]]) {
        const n = { t: best.t + dt, s: best.s + ds, dx: best.dx + ddx, dy: best.dy + ddy };
        if (Math.abs(n.t) > MAX_TURN || Math.abs(n.s - 1) > MAX_SCALE || Math.hypot(n.dx, n.dy) > MAX_SHIFT) continue;
        const v = iou(n.t, n.s, n.dx, n.dy);
        if (v > best.v + 1e-4) { best = { v, ...n }; improved = true; }
      }
    }
  }
  // Way off, or pinned against a limit: the placement itself is wrong. Fit the clean outline from scratch.
  const pinned = Math.abs(Math.abs(best.t) - MAX_TURN) < 0.01 || Math.abs(Math.abs(best.s - 1) - MAX_SCALE) < 0.002 || Math.hypot(best.dx, best.dy) > MAX_SHIFT - 1;
  let fresh: ReturnType<typeof georefOfImport> = null;
  if (best.v < 0.6 || pinned) {
    const res = autoAlign(g.getImageData(0, 0, img.width, img.height) as unknown as ImageData, rings);
    const gf = res && georefOfImport({ ...ref, controlPoints: res.controlPoints });
    if (res && gf && res.iou > best.v + 0.05 && res.iou - res.runnerUpIou >= 0.05) { fresh = gf; best = { v: res.iou, t: 0, s: 1, dx: 0, dy: 0 }; }
    else if (res) {
      // Two turns score alike (near-rectangular building): keep the current turn, fit position and scale.
      const locked = autoAlign(g.getImageData(0, 0, img.width, img.height) as unknown as ImageData, rings, { rotationDeg: 90 - g0.xAxisBearingDeg });
      const gl = locked && georefOfImport({ ...ref, controlPoints: locked.controlPoints });
      if (locked && gl && locked.iou > best.v + 0.05 && (locked.iou >= res.iou - 0.03 || best.v < 0.2)) { fresh = gl; best = { v: locked.iou, t: 0, s: 1, dx: 0, dy: 0 }; }
      console.log(`  ${b}: same turn as now ${locked ? (locked.iou * 100).toFixed(0) + '%' : 'none'} ${fresh ? 'used' : 'not used'}`);
    }
    console.log(`  ${b}: fresh fit of the clean outline ${res ? `${(res.iou * 100).toFixed(0)}% (next best turn ${(res.runnerUpIou * 100).toFixed(0)}%)` : 'none'} ${fresh ? 'used' : 'not used'}`);
  }
  const gain = best.v - before;
  console.log(`${b}: overlap ${(before * 100).toFixed(0)}% -> ${(best.v * 100).toFixed(0)}% (turn ${best.t.toFixed(2)} deg, scale ${best.s.toFixed(3)}, move ${Math.hypot(best.dx, best.dy).toFixed(1)} m)${gain >= MIN_GAIN ? '' : ' - kept as is'}`);
  if (gain < MIN_GAIN) { kept++; continue; }
  changed++;
  if (!save) continue;
  // New position of the reference: its image corners moved by the fit; others follow by registration.
  const W = ref.imageSize[0], H = ref.imageSize[1];
  const newRef = (px: [number, number]): LngLat => (fresh ? fresh.pxToLngLat(px) : fromM(move(toM(g0.pxToLngLat(px)), best.t, best.s, best.dx, best.dy)));
  for (const f of floors) {
    const reg = f.id === ref.id ? null : REG[f.id];
    if (f.id !== ref.id && (!reg || reg.ref !== ref.id)) continue;
    const [w, h] = f.imageSize;
    const corners: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
    const controlPoints = corners.map((px) => ({ px, lngLat: newRef(reg ? (applyAffine(reg.m, px[0], px[1]) as [number, number]) : px), note: `Fitted to the OpenStreetMap outline (overlap ${(best.v * 100).toFixed(0)}%)${reg ? ', stacked on ' + ref.id + ' by the walls' : ''}. Draft: not surveyed.` }));
    void W; void H;
    const r = await get(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ controlPoints, alignmentFrom: `auto:outline-fit${reg ? ' via ' + ref.id : ''}` }) });
    if (!r.ok) console.log(`  ${f.id}: save failed ${r.status}`);
  }
}
console.log(`${changed} buildings fitted better, ${kept} already as good${save ? ' (saved)' : ' (dry run)'}`);
