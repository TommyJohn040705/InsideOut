/**
 * Makes every floor sit inside its own building on the campus map. Each floor (not just one per
 * building) is scored by how much of its clean outline (styledPlan.ts picture) lies inside its
 * OpenStreetMap footprint. A floor scoring below MIN_INSIDE is refitted: scale locked to a good
 * floor of the same building when the sheets match (same drawing scale), turned like that floor or
 * by a quarter turn (sheets printed sideways), then moved and nudged until it sits inside the
 * footprint while covering as much of it as it can. Drafts only. Through the server:
 *   INSIDEOUT_URL=http://localhost:3001 npx tsx scripts/campus/fitAllFloors.ts [--save] [BUILDING ...]
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { georefOfImport, type FloorImport } from '../../src/campus/floorImports';
import type { LngLat } from '../../src/campus/georef';
import footprints from '../../src/data/campus/footprints.json';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const save = process.argv.includes('--save');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
/** Share of a floor's outline that must lie inside the footprint to count as placed right. */
const MIN_INSIDE = 0.85;
const H = { Connection: 'close' };
async function get(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, headers: { ...H, ...(init?.headers || {}) } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}
const inPoly = (x: number, y: number, r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

/** x-axis compass bearing (deg), metres per sheet pixel, outline centre in local metres. */
interface Pose { b: number; s: number; tx: number; ty: number }
const all: FloorImport[] = await (await get(`${BASE}/api/floor-imports`)).json();
const report: string[] = [];
for (const bld of [...new Set(all.map((f) => f.buildingId))]) {
  if (only.length && !only.includes(bld)) continue;
  const feat = (footprints as any).features.find((x: any) => x.properties.code === bld);
  const floors = all.filter((f) => f.buildingId === bld && f.styledImageUrl && f.rooms.length);
  if (!feat || !floors.length) continue;
  const rings: LngLat[][] = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates[0]] : feat.geometry.coordinates.map((p: LngLat[][]) => p[0]);
  const P = rings.flat(), lng0 = P.reduce((a, p) => a + p[0], 0) / P.length, lat0 = P.reduce((a, p) => a + p[1], 0) / P.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
  const toM = (ll: LngLat) => [(ll[0] - lng0) * kx, (ll[1] - lat0) * ky];
  const fromM = ([x, y]: number[]): LngLat => [lng0 + x / kx, lat0 + y / ky];
  const ringsM = rings.map((r) => r.map(toM));
  const C = 0.5, xs = ringsM.flat().map((p) => p[0]), ys = ringsM.flat().map((p) => p[1]);
  const fx0 = Math.min(...xs) - 60, fy0 = Math.min(...ys) - 60;
  const FW = Math.ceil((Math.max(...xs) + 60 - fx0) / C), FH = Math.ceil((Math.max(...ys) + 60 - fy0) / C);
  const foot = new Uint8Array(FW * FH); let footN = 0;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) if (ringsM.some((r) => inPoly(fx0 + (i + 0.5) * C, fy0 + (j + 0.5) * C, r))) { foot[j * FW + i] = 1; footN++; }
  let fcx = 0, fcy = 0; for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) if (foot[j * FW + i]) { fcx += fx0 + (i + 0.5) * C; fcy += fy0 + (j + 0.5) * C; }
  fcx /= footN; fcy /= footN;
  // The building's own wall direction: bearing of the footprint's longest edge.
  let footAxis = 0, longest = 0;
  for (const r of ringsM) for (let i = 1; i < r.length; i++) { const dx = r[i][0] - r[i - 1][0], dy = r[i][1] - r[i - 1][1], L = Math.hypot(dx, dy); if (L > longest) { longest = L; footAxis = (Math.atan2(dx, dy) * 180) / Math.PI; } }
  const data = await Promise.all(floors.map(async (f) => {
    const img = await loadImage(Buffer.from(await (await get(`${BASE}${f.styledImageUrl}`)).arrayBuffer()));
    const c = createCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data, st = Math.max(4, Math.round(Math.sqrt((img.width * img.height) / 25000)));
    // Only the drawing near this floor's own room labels: sheets often show the neighbouring
    // buildings a floor connects to, which have no labels and must not be fitted into the footprint.
    const R = Math.max(80, 0.06 * Math.max(img.width, img.height)), G = Math.ceil(R / 2);
    const gw = Math.ceil(img.width / G) + 1, near = new Uint8Array(gw * (Math.ceil(img.height / G) + 1));
    for (const r of f.rooms) {
      const lx = (r.coords.x / 100) * img.width, ly = (r.coords.y / 100) * img.height;
      for (let gy = Math.floor((ly - R) / G); gy <= Math.floor((ly + R) / G); gy++) for (let gx = Math.floor((lx - R) / G); gx <= Math.floor((lx + R) / G); gx++) if (gx >= 0 && gy >= 0 && gx < gw) near[gy * gw + gx] = 1;
    }
    const px: number[][] = [];
    for (let y = 0; y < img.height; y += st) for (let x = 0; x < img.width; x += st) if (d[(y * img.width + x) * 4 + 3] && near[Math.floor(y / G) * gw + Math.floor(x / G)]) px.push([x, y]);
    const cx = px.reduce((a, p) => a + p[0], 0) / (px.length || 1), cy = px.reduce((a, p) => a + p[1], 0) / (px.length || 1);
    return { f, px, cx, cy, st };
  }));
  type D = (typeof data)[number];
  // Sheet pixel -> local metres for a pose: image x runs along bearing b, image y (down) along b + 90.
  const place = (p: number[], q: Pose, D: D) => {
    const a = (q.b * Math.PI) / 180, dx = (p[0] - D.cx) * q.s, dy = (p[1] - D.cy) * q.s;
    return [q.tx + dx * Math.sin(a) + dy * Math.sin(a + Math.PI / 2), q.ty + dx * Math.cos(a) + dy * Math.cos(a + Math.PI / 2)];
  };
  const score = (D: D, q: Pose) => {
    let hit = 0;
    for (const p of D.px) { const [x, y] = place(p, q, D); const i = Math.floor((x - fx0) / C), j = Math.floor((y - fy0) / C); if (i >= 0 && j >= 0 && i < FW && j < FH && foot[j * FW + i]) hit++; }
    const inside = hit / (D.px.length || 1), cover = Math.min(1, (hit * (D.st * q.s) ** 2) / (footN * C * C));
    return { inside, cover, v: inside + 0.6 * cover };
  };
  const poseOf = (D: D): Pose | null => {
    const g = georefOfImport(D.f); if (!g || !D.px.length) return null;
    const [tx, ty] = toM(g.pxToLngLat([D.cx, D.cy]));
    return { b: g.xAxisBearingDeg, s: g.metresPerPixel, tx, ty };
  };
  const cur = data.filter((D) => D.px.length).map((D) => { const q = poseOf(D); return { D, q, sc: q ? score(D, q) : null }; });
  const anchor = cur.filter((c) => c.sc && c.sc.inside >= MIN_INSIDE).sort((a, z) => z.sc!.cover - a.sc!.cover)[0];
  for (const c of cur) {
    const name = c.D.f.id;
    if (c.sc && c.sc.inside >= MIN_INSIDE) { report.push(`ok    ${name}: ${(c.sc.inside * 100).toFixed(0)}% inside`); continue; }
    const sameSheet = !!anchor && Math.max(...anchor.D.f.imageSize) === Math.max(...c.D.f.imageSize);
    // Size: from a well-placed floor on the same kind of sheet, else so the floor's area matches the building's.
    const s0 = sameSheet ? anchor!.q!.s : Math.sqrt((footN * C * C) / (c.D.px.length * c.D.st * c.D.st));
    // Turn: like a well-placed floor; without one, the current turn and the building's own wall direction.
    const bases = anchor ? [anchor.q!.b] : [...new Set([c.q?.b, footAxis].filter((v): v is number => v != null).map((v) => Math.round(v * 4) / 4))];
    let best: { q: Pose; sc: ReturnType<typeof score> } | null = null;
    for (const b0 of bases) for (const k of [0, 90, 180, 270]) {
      let q: Pose = { b: b0 + k, s: s0, tx: fcx, ty: fcy };
      let sc = score(c.D, q);
      for (let dx = -30; dx <= 30; dx += 5) for (let dy = -30; dy <= 30; dy += 5) {
        const n = { ...q, tx: fcx + dx, ty: fcy + dy }, v = score(c.D, n);
        if (v.v > sc.v) { q = n; sc = v; }
      }
      for (const stp of [4, 2, 1, 0.5, 0.25]) {
        let imp = true;
        while (imp) {
          imp = false;
          for (const [db, ds, dx, dy] of [[stp / 2, 0, 0, 0], [-stp / 2, 0, 0, 0], [0, 0.01 * stp, 0, 0], [0, -0.01 * stp, 0, 0], [0, 0, stp, 0], [0, 0, -stp, 0], [0, 0, 0, stp], [0, 0, 0, -stp]]) {
            if (ds && sameSheet) continue;
            const n = { b: q.b + db, s: q.s * (1 + ds), tx: q.tx + dx, ty: q.ty + dy };
            if (Math.abs(n.b - (b0 + k)) > 4 || Math.abs(n.s / s0 - 1) > 0.35) continue;
            const v = score(c.D, n);
            if (v.v > sc.v + 1e-4) { q = n; sc = v; imp = true; }
          }
        }
      }
      if (!best || sc.v > best.sc.v + 0.02) best = { q, sc };
    }
    const was = c.sc ? `${(c.sc.inside * 100).toFixed(0)}%` : 'not placed';
    // --rough: a floor that is unplaced or mostly off its building takes a rough fit (40%+ inside): on the building beats beside it.
    const rough = process.argv.includes('--rough') && !!best && best.sc.inside >= 0.4 && (!c.sc || c.sc.inside < 0.3);
    const ok = !!best && ((best.sc.inside >= 0.75 && (!c.sc || best.sc.v > c.sc.v + 0.05)) || rough);
    report.push(`${ok ? 'FIXED' : 'left '} ${name}: inside ${was} -> ${(best!.sc.inside * 100).toFixed(0)}% (covers ${(best!.sc.cover * 100).toFixed(0)}% of the building)${sameSheet ? ', scale from ' + anchor!.D.f.id : ''}`);
    if (!ok || !save) continue;
    const [w, h] = c.D.f.imageSize;
    const controlPoints = ([[0, 0], [w, 0], [w, h], [0, h]] as [number, number][]).map((px) => ({ px, lngLat: fromM(place(px, best!.q, c.D)), note: `Fitted inside the OpenStreetMap outline (${(best!.sc.inside * 100).toFixed(0)}% inside). Draft: not surveyed.` }));
    const r = await get(`${BASE}/api/floor-imports/${encodeURIComponent(name)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ controlPoints, alignmentFrom: `auto:fitted inside outline${sameSheet ? ', scale from ' + anchor!.D.f.id : ''}` }) });
    if (!r.ok) report.push(`  save failed ${r.status}`);
  }
}
console.log(report.filter((l) => !l.startsWith('ok')).join('\n'));
console.log(`${report.filter((l) => l.startsWith('ok')).length} floors already inside, ${report.filter((l) => l.startsWith('FIXED')).length} to fix, ${report.filter((l) => l.startsWith('left')).length} left${save ? ' (saved)' : ' (dry run)'}`);
