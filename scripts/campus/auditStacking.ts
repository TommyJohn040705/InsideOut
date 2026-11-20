/**
 * Are each building's floors stacked right? Elevators and stairs go straight up, so on a well-placed
 * floor most of them have a partner within MATCH_M on the floor above or below. Reports, per floor,
 * the share of its elevator/stair rooms that line up, and flags floors below MIN_SHARE. Reads
 * data/store.json directly (no server). Usage:
 *   npx tsx scripts/campus/auditStacking.ts [--json] [BUILDING ...]
 */
import fs from 'fs';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import { distanceM, type LngLat } from '../../src/campus/georef';

export const MATCH_M = 4;
export const MIN_SHARE = 0.5;

export interface FloorStack { id: string; building: string; floor: number; shafts: number; lined: number; share: number | null }

/** Pure: shafts per floor (map positions) -> how many line up with a neighbouring floor. */
export function stackShares(floors: { id: string; building: string; floor: number; shafts: LngLat[] }[]): FloorStack[] {
  return floors.map((f) => {
    const nb = floors.filter((o) => o.building === f.building && o.id !== f.id && Math.abs(o.floor - f.floor) <= 1.5 && o.floor !== f.floor);
    const lined = f.shafts.filter((p) => nb.some((o) => o.shafts.some((q) => distanceM(p, q) <= MATCH_M))).length;
    return { id: f.id, building: f.building, floor: f.floor, shafts: f.shafts.length, lined, share: f.shafts.length && nb.length ? lined / f.shafts.length : null };
  });
}

if (process.argv[1]?.includes('auditStacking')) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const imports: FloorImport[] = Object.values(JSON.parse(fs.readFileSync('data/store.json', 'utf8')).floorImports);
  const floors = imports.filter((f) => f.published && (!only.length || only.includes(f.buildingId))).flatMap((f) => {
    const g = georefOfImport(f);
    if (!g) return [];
    const [W, H] = g.source.imageSize;
    const shafts = (f.rooms || []).filter((r) => r.category === 'elevator' || r.category === 'stairs').map((r) => g.pxToLngLat([(r.coords.x / 100) * W, (r.coords.y / 100) * H]));
    return [{ id: f.id, building: f.buildingId, floor: f.floorNumber, shafts }];
  });
  const res = stackShares(floors);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }
  const byB = new Map<string, FloorStack[]>();
  for (const r of res) byB.set(r.building, [...(byB.get(r.building) || []), r]);
  let bad = 0, judged = 0;
  for (const [b, fs_] of [...byB].sort()) {
    const j = fs_.filter((x) => x.share != null);
    judged += j.length;
    const weak = j.filter((x) => x.share! < MIN_SHARE);
    bad += weak.length;
    const line = j.map((x) => `${x.floor}:${Math.round(x.share! * 100)}%`).join(' ');
    console.log(`${weak.length ? 'CHECK' : 'ok   '} ${b.padEnd(12)} ${line || '(one floor or no shafts)'}`);
  }
  console.log(`${judged - bad} of ${judged} floors have at least ${MIN_SHARE * 100}% of their stairs/elevators lined up (within ${MATCH_M} m) with a neighbouring floor; ${bad} to check.`);
}
