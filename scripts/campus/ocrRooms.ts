/**
 * Reads room numbers off imported floor plans with OCR (tesseract.js, runs locally, no daily limit)
 * and saves them through the running server, then builds each floor's hallway network.
 *   npx tsx scripts/campus/ocrRooms.ts             every floor with no rooms yet
 *   npx tsx scripts/campus/ocrRooms.ts <ids...>    just these floors
 */
import { createWorker, PSM } from 'tesseract.js';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { spawnSync } from 'node:child_process';
import { roomsFromOcr, type OcrWord } from '../../src/campus/ocrRooms';
import type { FloorImport } from '../../src/campus/floorImports';

const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
async function fetchRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try { return await fetch(url, { ...init, headers: { ...(init?.headers || {}), Connection: 'close' } }); }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}

const all: FloorImport[] = await (await fetchRetry(`${BASE}/api/floor-imports`)).json();
// --redo-ocr also re-reads floors whose rooms came from an earlier OCR run.
const redo = process.argv.includes('--redo-ocr');
// --part=k/n takes every n-th floor starting at k, so several processes can share the work.
const [partK, partN] = (process.argv.find((a) => a.startsWith('--part='))?.slice(7) || '0/1').split('/').map(Number);
const todo = all.filter((f) => (ids.length ? ids.includes(f.id) : !f.rooms.length || (redo && /tesseract/.test(f.extraction?.model || '')))).filter((_, i) => i % partN === partK);
console.log(`${todo.length} floors`);
const worker = await createWorker('eng');
await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });

/** OCR the sheet turned by rot degrees at scale; words come back in original-image percent. */
async function pass(src: Image, rot: number, scale: number): Promise<OcrWord[]> {
  const W = src.width * scale, H = src.height * scale, sw = rot % 180 ? H : W, sh = rot % 180 ? W : H;
  const c = createCanvas(sw, sh); const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, sw, sh); g.translate(sw / 2, sh / 2); g.rotate((rot * Math.PI) / 180); g.drawImage(src, -W / 2, -H / 2, W, H);
  const { data } = await worker.recognize(c.toBuffer('image/png'));
  const a = (-rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return data.words.map((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2 - sw / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2 - sh / 2;
    const ox = (cx * cos - cy * sin + W / 2) / scale, oy = (cx * sin + cy * cos + H / 2) / scale; // back to unrotated pixels
    return { text: w.text, confidence: w.confidence, x: (ox / src.width) * 100, y: (oy / src.height) * 100, h: ((w.bbox.y1 - w.bbox.y0) / scale / src.height) * 100 };
  });
}

const done: string[] = [];
for (const f of todo) {
  const t = Date.now();
  try {
    const src = await loadImage(Buffer.from(await (await fetchRetry(`${BASE}${f.imageUrl}`)).arrayBuffer()));
    const passes = [];
    for (const rot of [0, 90, 270]) passes.push({ rot, words: await pass(src, rot, 1) });
    const count = (ws: OcrWord[]) => ws.filter((w) => w.confidence >= 60 && /^[B0-9]?\d{3}[A-Z]?$/.test(w.text)).length;
    const best = Math.max(...passes.map((p) => count(p.words)));
    // Upside-down passes read reversed garbage; keep passes that find at least a quarter of the best.
    const good = passes.filter((p) => count(p.words) >= best * 0.25 && count(p.words) > 0);
    const top = good.sort((x, y) => count(y.words) - count(x.words))[0];
    if (top) good.push({ rot: top.rot, words: await pass(src, top.rot, 2) }); // second look at 2x, catches other numbers
    const rooms = roomsFromOcr(good.flatMap((p) => p.words), f.floorCode, f.floorNumber, f.id);
    if (!rooms.length) { console.log(`${f.id}: no room numbers read`); continue; }
    const res = await fetchRetry(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms, extraction: { model: 'tesseract.js OCR (room numbers only)', at: new Date().toISOString() } }),
    });
    if (!res.ok) throw new Error(`save ${res.status}`);
    done.push(f.id);
    console.log(`${f.id}: ${rooms.length} rooms (${rooms.filter((r) => r.category !== 'other').length} typed) in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  } catch (e: any) { console.error(`${f.id}: failed: ${e?.message || e}`); }
}
await worker.terminate();
if (done.length) spawnSync(process.execPath, ['--import', 'tsx', 'scripts/campus/autoHallways.ts', ...done], { stdio: 'inherit', env: process.env });
