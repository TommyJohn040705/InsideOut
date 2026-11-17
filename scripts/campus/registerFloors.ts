/**
 * Lines every imported floor up against a reference floor of its building by their walls
 * (src/campus/floorRegister.ts) and writes src/data/campus/floorRegistration.json, which
 * floorImports.importLocator uses to match stairs and elevators across floors by position.
 * The reference is a floor aligned to the map (by hand first), else the floor with most rooms.
 * Every match is kept, with its score and the best other quarter turn for review. Reads through the server:
 *   INSIDEOUT_URL=http://localhost:3001 npx tsx scripts/campus/registerFloors.ts [BUILDING ...]
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildingOnly, cellsToPixels, maskOf, register, type Affine, type Mask } from '../../src/campus/floorRegister';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import { renderLayers } from './pdfLayers';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const OUT = 'src/data/campus/floorRegistration.json';
const CELL = 8;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// --no-turn: the sheets are known (from their north arrows) to face the same way as the reference.
const turns = process.argv.includes('--no-turn') ? [0] : undefined;

async function get(url: string): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { headers: { Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}

async function maskFor(f: FloorImport): Promise<Mask> {
  const img = await loadImage(Buffer.from(await (await get(`${BASE}${f.imageUrl}`)).arrayBuffer()));
  const [w, h] = [img.width, img.height];
  // The PDF's wall layers when it has them (no text or title block); else the drawing itself.
  if (/\.pdf$/i.test(f.fileUrl)) {
    const pdf = new Uint8Array(await (await get(`${BASE}${f.fileUrl}`)).arrayBuffer());
    const walls = await renderLayers(pdf, w, h, 'walls').catch(() => null);
    if (walls) return maskOf(walls.gray, w, h, CELL);
  }
  const c = createCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return buildingOnly(maskOf(gray, w, h, CELL));
}

const all: FloorImport[] = await (await get(`${BASE}/api/floor-imports`)).json();
const out: Record<string, { ref: string; m: Affine; score: number; runnerUp: number }> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const byBuilding = new Map<string, FloorImport[]>();
for (const f of all) if (f.rooms.length && (!only.length || only.includes(f.buildingId))) (byBuilding.get(f.buildingId) || byBuilding.set(f.buildingId, []).get(f.buildingId)!).push(f);

for (const [b, floors] of byBuilding) {
  if (floors.length < 2) continue;
  const rank = (f: FloorImport) => (georefOfImport(f) ? (f.alignmentFrom?.startsWith('auto') ? 2e4 : 4e4) : 0) + f.rooms.length;
  const refArg = process.argv.find((a) => a.startsWith('--ref='))?.slice(6);
  const ref = floors.find((f) => f.id === refArg) || [...floors].sort((a, z) => rank(z) - rank(a))[0];
  for (const f of floors) delete out[f.id];
  const refMask = await maskFor(ref);
  for (const f of floors) {
    if (f === ref) continue;
    const t = Date.now();
    const r = register(refMask, await maskFor(f), 80, turns);
    const ok = !!r;
    console.log(`${f.id} -> ${ref.id}: ${r ? `${(r.score * 100).toFixed(0)}% (other turns ${(r.runnerUp * 100).toFixed(0)}%), turn ${r.turn}` : 'no drawing'} ${ok ? 'kept' : 'skipped'} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    if (ok) out[f.id] = { ref: ref.id, m: cellsToPixels(r!.m, CELL).map((v) => +v.toFixed(4)) as Affine, score: +r!.score.toFixed(3), runnerUp: +r!.runnerUp.toFixed(3) };
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}
console.log(`${Object.keys(out).length} floors registered -> ${OUT}`);
