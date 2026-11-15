/**
 * Reads a hallway network off each imported floor-plan drawing (src/campus/planGraph.ts) and saves
 * it through the running InsideOut server. Usage:
 *   npx tsx scripts/campus/autoHallways.ts            every floor that has rooms
 *   npx tsx scripts/campus/autoHallways.ts DC-01-...  just these floor ids
 *   --missing                                         skip floors that already have one
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildPlanGraph, detectStairs, stairBoxesFromLayer } from '../../src/campus/planGraph';
import { renderLayers } from './pdfLayers';

// Shapes on the stair layer that really are flights: they contain a row of treads (a bridge's X-bracing does not).
const treadBoxes = (g: Uint8Array, w: number, h: number) => { const t = detectStairs(g, w, h); return stairBoxesFromLayer(g, w, h).filter((b) => t.some((x) => x.x0 < b.x1 && x.x1 > b.x0 && x.y0 < b.y1 && x.y1 > b.y0)); };
import type { FloorImport } from '../../src/campus/floorImports';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
const ids = args.filter((a) => !a.startsWith('--'));

// The dev server is sometimes busy (saving the store, rebuilding); retry a failed request a few times.
async function fetchRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, headers: { ...(init?.headers || {}), Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}

const all: FloorImport[] = await (await fetchRetry(`${BASE}/api/floor-imports`)).json();
// --part=k/n takes every n-th floor starting at k, so several processes can share the work.
const [partK, partN] = (args.find((a) => a.startsWith('--part='))?.slice(7) || '0/1').split('/').map(Number);
const todo = all.filter((f) => f.rooms.length && (ids.length ? ids.includes(f.id) : true) && !(missingOnly && (f.autoNodes || f.autoHallways?.length))).filter((_, i) => i % partN === partK);
console.log(`${todo.length} floors`);

for (const f of todo) {
  const t = Date.now();
  try {
    const res = await fetchRetry(`${BASE}${f.imageUrl}`);
    if (!res.ok) throw new Error(`image ${res.status}`);
    const img = await loadImage(Buffer.from(await res.arrayBuffer()));
    const c = createCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, img.width, img.height); // transparent PNG areas read as white
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const gray = new Uint8Array(img.width * img.height);
    for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    // Stairs this script added before are found again; drop them so they are not counted twice.
    const rooms = f.rooms.filter((r) => !/-st\d+$/.test(r.id));
    // PDFs that keep their CAD layers: walls and stairs straight from those layers (exact); else read the image.
    let walls: Uint8Array | null = null, stairs = null as ReturnType<typeof detectStairs> | null, source = 'image';
    if (/\.pdf$/i.test(f.fileUrl)) {
      const pr = await fetchRetry(`${BASE}${f.fileUrl}`);
      if (pr.ok) {
        const pdf = new Uint8Array(await pr.arrayBuffer());
        const w = await renderLayers(pdf.slice(), img.width, img.height, 'walls').catch(() => null);
        if (w) {
          walls = w.gray; source = 'layers';
          const s = await renderLayers(pdf.slice(), img.width, img.height, 'stairs').catch(() => null);
          stairs = s ? treadBoxes(s.gray, img.width, img.height) : null;
        }
      }
    }
    const pg = buildPlanGraph(walls || gray, img.width, img.height, rooms, f.id, { cleanWalls: !!walls, stairs: stairs || detectStairs(gray, img.width, img.height) });
    const newRooms = [...rooms, ...pg.addedRooms.map((r) => ({ ...r, floor: f.floorNumber, purposeVerification: 'unverified_drawing_only' }))];
    if (newRooms.length !== f.rooms.length || pg.addedRooms.length) {
      const pr = await fetchRetry(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rooms: newRooms }) });
      if (!pr.ok) throw new Error(`rooms save ${pr.status}`);
    }
    const put = await fetchRetry(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}/auto-hallways`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hallways: pg.hallways }),
    });
    if (!put.ok) throw new Error(`save ${put.status} ${await put.text()}`);
    console.log(`${f.id}: ${pg.hallways.length} nodes, ${pg.linkedRoomIds.length}/${f.rooms.length} rooms linked, ${pg.addedRooms.length} stairs found, from ${source} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e: any) {
    console.error(`${f.id}: failed: ${e?.message || e}`);
  }
}
