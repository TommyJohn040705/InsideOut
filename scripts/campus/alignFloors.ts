/**
 * Draft map alignment for imported floors that have none (src/campus/autoAlign.ts), so stairs and
 * elevators can be matched across floors by position. When another floor of the building is aligned
 * and its sheet is the same size, the scale is locked to that floor's (same drawing scale), which
 * leaves only position and turn to search. A fit is saved only when it clearly beats the best pose
 * turned 20 degrees or more away; near-ties (symmetric buildings) are skipped. Saved fits are marked
 * as automatic drafts, not reviewed. Usage (through the running server):
 *   npx tsx scripts/campus/alignFloors.ts            dry run: print the fits
 *   npx tsx scripts/campus/alignFloors.ts --save     save the clear ones
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { autoAlign } from '../../src/campus/autoAlign';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import footprints from '../../src/data/campus/footprints.json';
import type { LngLat } from '../../src/campus/georef';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const save = process.argv.includes('--save');
/** Overlap needed, and how far ahead of the runner-up turn it must be. */
const MIN_IOU = 0.6, MIN_LEAD = 0.08;

// The dev server drops reused connections now and then; close each one and retry a failed request.
async function fetch(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await globalThis.fetch(url, { ...init, headers: { ...(init?.headers || {}), Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}

const all: FloorImport[] = await (await fetch(`${BASE}/api/floor-imports`)).json();
const todo = all.filter((f) => f.rooms.length && !georefOfImport(f));
let saved = 0;
for (const f of todo) {
  const feat = (footprints as any).features.find((x: any) => x.properties.code === f.buildingId);
  if (!feat) { console.log(`${f.id}: no footprint`); continue; }
  const rings: LngLat[][] = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates[0]] : feat.geometry.coordinates.map((p: LngLat[][]) => p[0]);
  const sib = all.find((x) => x.buildingId === f.buildingId && x.id !== f.id && Math.max(...x.imageSize) === Math.max(...f.imageSize) && georefOfImport(x));
  const img = await loadImage(Buffer.from(await (await fetch(`${BASE}${f.imageUrl}`)).arrayBuffer()));
  const c = createCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const res = autoAlign(g.getImageData(0, 0, img.width, img.height) as unknown as ImageData, rings, sib ? { metresPerPixel: georefOfImport(sib)!.metresPerPixel } : {});
  if (!res) { console.log(`${f.id}: no outline found`); continue; }
  const clear = res.iou >= MIN_IOU && res.iou - res.runnerUpIou >= MIN_LEAD;
  console.log(`${f.id}: overlap ${(res.iou * 100).toFixed(0)}%, runner-up ${(res.runnerUpIou * 100).toFixed(0)}%, ${res.rotationDeg}°, ${sib ? `scale from ${sib.id}` : 'free scale'} -> ${clear ? 'clear' : 'skip'}`);
  if (!clear || !save) continue;
  const r = await fetch(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlPoints: res.controlPoints, alignmentFrom: `auto:outline${sib ? `-scale-${sib.id}` : ''}` }),
  });
  if (r.ok) saved++; else console.log(`${f.id}: save failed ${r.status}`);
}
console.log(`${todo.length} unaligned floors${save ? `, ${saved} saved` : ' (dry run)'}`);
