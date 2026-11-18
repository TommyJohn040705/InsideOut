/**
 * Trims each floor's clean picture (styledPlan.ts) to its own building: everything more than
 * SLACK_M outside the OpenStreetMap footprint (neighbouring buildings and links the sheet also
 * draws) is made transparent, so the floor sits seamlessly inside its building on the campus map.
 * Only floors already mostly inside their footprint (MIN_INSIDE) are trimmed, so a badly placed
 * floor never loses its own rooms. Writes the picture in place (regenerate with autoHallways.ts).
 *   npx tsx scripts/campus/clipFloors.ts [--save] [BUILDING ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import type { LngLat } from '../../src/campus/georef';
import footprints from '../../src/data/campus/footprints.json';

const save = process.argv.includes('--save');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SLACK_M = 2, MIN_INSIDE = 0.6;
const s = JSON.parse(readFileSync('data/store.json', 'utf8')) as { floorImports: FloorImport[] };
const inPoly = (x: number, y: number, r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
let done = 0;
for (const f of s.floorImports) {
  if (!f.styledImageUrl || (only.length && !only.includes(f.buildingId))) continue;
  const g = georefOfImport(f), feat = (footprints as any).features.find((x: any) => x.properties.code === f.buildingId);
  if (!g || !feat) continue;
  const rings: LngLat[][] = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates[0]] : feat.geometry.coordinates.map((p: LngLat[][]) => p[0]);
  const P = rings.flat(), lng0 = P[0][0], lat0 = P[0][1], kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toM = (ll: LngLat) => [(ll[0] - lng0) * kx, (ll[1] - lat0) * 111320];
  const ringsM = rings.map((r) => r.map(toM));
  // Footprint raster at 0.5 m, widened by the slack.
  const C = 0.5, xs = ringsM.flat().map((p) => p[0]), ys = ringsM.flat().map((p) => p[1]);
  const x0 = Math.min(...xs) - 10, y0 = Math.min(...ys) - 10, W = Math.ceil((Math.max(...xs) + 10 - x0) / C), Hh = Math.ceil((Math.max(...ys) + 10 - y0) / C);
  const base = new Uint8Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) if (ringsM.some((r) => inPoly(x0 + (i + 0.5) * C, y0 + (j + 0.5) * C, r))) base[j * W + i] = 1;
  const R = Math.round(SLACK_M / C), foot = new Uint8Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) if (base[j * W + i]) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < W && b < Hh && di * di + dj * dj <= R * R) foot[b * W + a] = 1; }
  // Sheet pixel -> metres is affine: read it off three points.
  const o = toM(g.pxToLngLat([0, 0])), ex = toM(g.pxToLngLat([1000, 0])), ey = toM(g.pxToLngLat([0, 1000]));
  const ax = [(ex[0] - o[0]) / 1000, (ex[1] - o[1]) / 1000], ay = [(ey[0] - o[0]) / 1000, (ey[1] - o[1]) / 1000];
  const inside = (x: number, y: number) => { const mx = o[0] + ax[0] * x + ay[0] * y, my = o[1] + ax[1] * x + ay[1] * y, i = Math.floor((mx - x0) / C), j = Math.floor((my - y0) / C); return i >= 0 && j >= 0 && i < W && j < Hh && foot[j * W + i] === 1; };
  const file = f.styledImageUrl.replace('/uploads/', 'data/uploads/');
  const img = await loadImage(file);
  const cv = createCanvas(img.width, img.height), cg = cv.getContext('2d'); cg.drawImage(img, 0, 0);
  const id = cg.getImageData(0, 0, img.width, img.height), d = id.data;
  let opaque = 0, kept = 0;
  for (let y = 0; y < img.height; y += 4) for (let x = 0; x < img.width; x += 4) if (d[(y * img.width + x) * 4 + 3]) { opaque++; if (inside(x, y)) kept++; }
  const share = kept / (opaque || 1);
  if (share < MIN_INSIDE || share > 0.995) { if (share < MIN_INSIDE) console.log(`${f.id}: ${(share * 100).toFixed(0)}% inside, left as is`); continue; }
  let cut = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { const k = (y * img.width + x) * 4; if (d[k + 3] && !inside(x, y)) { d[k + 3] = 0; cut++; } }
  done++;
  console.log(`${f.id}: trimmed ${((1 - share) * 100).toFixed(0)}% of the picture outside the building`);
  if (save) { cg.putImageData(id, 0, 0); writeFileSync(file, cv.toBuffer('image/png')); }
}
console.log(`${done} floor pictures trimmed${save ? '' : ' (dry run)'}`);
