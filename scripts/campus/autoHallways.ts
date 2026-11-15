/**
 * Reads a hallway network off each imported floor-plan drawing (src/campus/planGraph.ts) and saves
 * it through the running InsideOut server. Usage:
 *   npx tsx scripts/campus/autoHallways.ts            every floor that has rooms
 *   npx tsx scripts/campus/autoHallways.ts DC-01-...  just these floor ids
 *   --missing                                         skip floors that already have one
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildPlanGraph } from '../../src/campus/planGraph';
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
const todo = all.filter((f) => f.rooms.length && (ids.length ? ids.includes(f.id) : true) && !(missingOnly && f.autoHallways?.length));
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
    const pg = buildPlanGraph(gray, img.width, img.height, f.rooms, f.id);
    const put = await fetchRetry(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}/auto-hallways`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hallways: pg.hallways }),
    });
    if (!put.ok) throw new Error(`save ${put.status} ${await put.text()}`);
    console.log(`${f.id}: ${pg.hallways.length} nodes, ${pg.linkedRoomIds.length}/${f.rooms.length} rooms linked (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e: any) {
    console.error(`${f.id}: failed: ${e?.message || e}`);
  }
}
