/**
 * Re-stacks floors whose stairs and elevators do not line up with the floor above or below
 * (scripts/campus/auditStacking.ts). Elevators and stairs go straight up, so a floor is moved - turned
 * by a quarter turn and/or up to MAX_TURN degrees, moved up to MAX_SHIFT m, never scaled - until as
 * many of its shafts as possible sit within MATCH_M of the nearest well-stacked floor's shafts.
 * Saved only when the match is clear (at least MIN_INLIERS shafts and MIN_SHARE of them), clearly
 * better than now, and the floor's centre stays inside its building. Draft alignments, not reviewed.
 * Through the server:
 *   INSIDEOUT_URL=http://localhost:3000 npx tsx scripts/campus/stackByShafts.ts [--save] [BUILDING ...]
 */
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import type { LngLat } from '../../src/campus/georef';
import { FOOTPRINTS } from '../../src/campus/campusData';
import { buildingAt, footprintsOf } from '../../src/campus/whereAmI';
import { MATCH_M } from './auditStacking';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const save = process.argv.includes('--save');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MAX_TURN = 3, MAX_SHIFT = 30, MIN_INLIERS = 4, MIN_SHARE = 0.6, MIN_GAIN = 0.3, GOOD = 0.5;
const FPS = footprintsOf(FOOTPRINTS);

type P = [number, number];
export interface Move { turnDeg: number; dx: number; dy: number; inliers: number }

/** Pure: best rigid move (turn about c, then shift) taking shafts a onto shafts b, in metres. */
export function bestMove(a: P[], b: P[], c: P, opts = { maxTurn: MAX_TURN, maxShift: MAX_SHIFT, match: MATCH_M }): Move | null {
  let best: (Move & { err: number }) | null = null;
  const turns: number[] = [];
  for (const q of [0, 90, 180, 270]) for (let d = -opts.maxTurn; d <= opts.maxTurn + 1e-9; d += 1) turns.push(q + d);
  for (const t of turns) {
    const r = (t * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
    const ar = a.map(([x, y]): P => [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs]);
    for (const p of ar) for (const q of b) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      if (Math.hypot(dx, dy) > opts.maxShift) continue;
      let n = 0, err = 0, sx = 0, sy = 0;
      for (const s of ar) {
        let m = Infinity, mx = 0, my = 0;
        for (const u of b) { const e = Math.hypot(s[0] + dx - u[0], s[1] + dy - u[1]); if (e < m) { m = e; mx = u[0] - s[0]; my = u[1] - s[1]; } }
        if (m <= opts.match) { n++; err += m; sx += mx; sy += my; }
      }
      // A quarter turn needs stronger evidence than a nudge (symmetric shaft layouts).
      const need = Math.abs(((t + 45) % 90) - 45) > 0.1 || Math.abs(t) > opts.maxTurn ? 2 : 0;
      if (n - need <= 0) continue;
      if (!best || n > best.inliers || (n === best.inliers && err < best.err)) best = { turnDeg: t, dx: n ? sx / n : dx, dy: n ? sy / n : dy, inliers: n, err };
    }
  }
  return best && { turnDeg: best.turnDeg, dx: best.dx, dy: best.dy, inliers: best.inliers };
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, headers: { ...(init?.headers || {}), Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}

if (process.argv[1]?.includes('stackByShafts')) {
  const all: FloorImport[] = await (await get(`${BASE}/api/floor-imports`)).json();
  let fixed = 0, left = 0;
  for (const b of [...new Set(all.map((f) => f.buildingId))].sort()) {
    if (only.length && !only.includes(b)) continue;
    const fl = all.filter((f) => f.buildingId === b && f.published && georefOfImport(f));
    if (fl.length < 2) continue;
    const o = georefOfImport(fl[0])!.corners[0];
    const k = 111_320 * Math.cos((o[1] * Math.PI) / 180);
    const toM = (p: LngLat): P => [(p[0] - o[0]) * k, (p[1] - o[1]) * 111_320];
    const fromM = (p: P): LngLat => [o[0] + p[0] / k, o[1] + p[1] / 111_320];
    const shaftsOf = (f: FloorImport, g = georefOfImport(f)!) => (f.rooms || []).filter((r) => r.category === 'elevator' || r.category === 'stairs')
      .map((r) => toM(g.pxToLngLat([(r.coords.x / 100) * f.imageSize[0], (r.coords.y / 100) * f.imageSize[1]])));
    const S = new Map(fl.map((f) => [f.id, shaftsOf(f)]));
    const near = (p: P, qs: P[]) => qs.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= MATCH_M);
    const share = (f: FloorImport) => {
      const nb = fl.filter((x) => x.id !== f.id && x.floorNumber !== f.floorNumber && Math.abs(x.floorNumber - f.floorNumber) <= 1.5);
      const s = S.get(f.id)!;
      return s.length && nb.length ? s.filter((p) => nb.some((x) => near(p, S.get(x.id)!))).length / s.length : null;
    };
    // Weakest first gets fixed against the nearest floor that is already well stacked.
    const weak = fl.filter((f) => (share(f) ?? 1) < GOOD && S.get(f.id)!.length >= MIN_INLIERS).sort((x, y) => (share(x) ?? 0) - (share(y) ?? 0));
    for (const f of weak) {
      const before = share(f) ?? 0;
      const refs = fl.filter((x) => x.id !== f.id && (share(x) ?? 0) >= GOOD && S.get(x.id)!.length >= MIN_INLIERS)
        .sort((x, y) => Math.abs(x.floorNumber - f.floorNumber) - Math.abs(y.floorNumber - f.floorNumber));
      const ref = refs[0];
      if (!ref) { console.log(`left  ${f.id}: ${Math.round(before * 100)}% lined up, no well-stacked floor to match`); left++; continue; }
      const g = georefOfImport(f)!;
      const cornersM = g.corners.map(toM);
      const c: P = [cornersM.reduce((s, p) => s + p[0], 0) / 4, cornersM.reduce((s, p) => s + p[1], 0) / 4];
      const mv = bestMove(S.get(f.id)!, S.get(ref.id)!, c);
      const n = S.get(f.id)!.length;
      const r = mv ? (mv.turnDeg * Math.PI) / 180 : 0;
      const T = (p: P): P => mv ? [c[0] + (p[0] - c[0]) * Math.cos(r) - (p[1] - c[1]) * Math.sin(r) + mv.dx, c[1] + (p[0] - c[0]) * Math.sin(r) + (p[1] - c[1]) * Math.cos(r) + mv.dy] : p;
      const centre = fromM(T(c));
      // Never move a floor out of its building (a centre already outside, e.g. a wide sheet margin, may stay so).
      const stays = buildingAt(centre, 5, FPS)?.id === b || buildingAt(fromM(c), 5, FPS)?.id !== b;
      const ok = mv && mv.inliers >= MIN_INLIERS && mv.inliers / n >= MIN_SHARE && mv.inliers / n - before >= MIN_GAIN && stays;
      console.log(`${ok ? 'fix ' : 'left'}  ${f.id}: ${Math.round(before * 100)}% -> ${mv ? Math.round((mv.inliers / n) * 100) : 0}% lined up with ${ref.id} (turn ${mv?.turnDeg.toFixed(0) ?? '-'} deg, move ${mv ? Math.hypot(mv.dx, mv.dy).toFixed(1) : '-'} m)${stays ? '' : ', would leave the building'}`);
      if (!ok) { left++; continue; }
      fixed++;
      S.set(f.id, S.get(f.id)!.map(T));
      if (!save) continue;
      const [w, h] = f.imageSize;
      const controlPoints = ([[0, 0], [w, 0], [w, h], [0, h]] as [number, number][]).map((px) => ({ px, lngLat: fromM(T(toM(g.pxToLngLat(px)))), note: `Stacked on ${ref.id} by its stairs and elevators (${mv!.inliers} of ${n} line up within ${MATCH_M} m). Draft: not surveyed.` }));
      const res = await get(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ controlPoints, alignmentFrom: `auto:shaft-stack via ${ref.id}` }) });
      if (!res.ok) console.log(`  ${f.id}: save failed ${res.status}`);
    }
  }
  console.log(`${fixed} floors re-stacked by their stairs and elevators, ${left} left as they are${save ? ' (saved)' : ' (dry run)'}`);
}
