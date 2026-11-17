/**
 * Puts floors that have no map placement onto the map by stacking them on the reference floor
 * they are lined up with by their walls (src/data/campus/floorRegistration.json), when that floor is
 * placed. Draft alignments only. Through the server:
 *   INSIDEOUT_URL=http://localhost:3001 npx tsx scripts/campus/stackFloors.ts [--save]
 */
import { readFileSync } from 'node:fs';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import { applyAffine, type Affine } from '../../src/campus/floorRegister';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const save = process.argv.includes('--save');
const REG = JSON.parse(readFileSync('src/data/campus/floorRegistration.json', 'utf8')) as Record<string, { ref: string; m: Affine; score: number }>;
const H = { Connection: 'close' };
/** Below this wall match the stacking is a guess; leave such floors off the map. */
const MIN_MATCH = 0.3;
const all: FloorImport[] = await (await fetch(`${BASE}/api/floor-imports`, { headers: H })).json();
let placed = 0; const skipped: string[] = [];
for (const f of all) {
  if (!f.rooms.length || georefOfImport(f)) continue;
  const reg = REG[f.id], ref = reg && all.find((x) => x.id === reg.ref), g = ref && georefOfImport(ref);
  if (g && reg.score < MIN_MATCH) { skipped.push(`${f.id} (wall match only ${(reg.score * 100).toFixed(0)}%)`); continue; }
  if (!g) { skipped.push(`${f.id} (${reg ? 'its reference floor is not placed either' : 'not lined up with another floor'})`); continue; }
  const [w, h] = f.imageSize;
  const controlPoints = ([[0, 0], [w, 0], [w, h], [0, h]] as [number, number][]).map((px) => ({ px, lngLat: g.pxToLngLat(applyAffine(reg.m, px[0], px[1]) as [number, number]), note: `Stacked on ${ref!.id} by the walls (match ${(reg.score * 100).toFixed(0)}%). Draft: not surveyed.` }));
  placed++;
  console.log(`${f.id}: stacked on ${ref!.id} (wall match ${(reg.score * 100).toFixed(0)}%)`);
  if (save) {
    const r = await fetch(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ controlPoints, alignmentFrom: `auto:stacked on ${ref!.id} by the walls` }) });
    if (!r.ok) console.log(`  save failed ${r.status}`);
  }
}
console.log(`${placed} floors placed by stacking${save ? '' : ' (dry run)'}; not placed:\n  ${skipped.join('\n  ')}`);
