/**
 * Small persistent store for map data people add at runtime: imported floor plans and the
 * corrections audit log. One JSON file plus an uploads folder, both under data/ (gitignored,
 * because uploads can be university-owned drawings).
 */
import fs from 'fs';
import path from 'path';
import type { FloorImport } from '../src/campus/floorImports';

export interface StoreData {
  floorImports: FloorImport[];
  /** Shared lists the app syncs whole: corrections, roomOverrides, reports. */
  kv: Record<string, unknown>;
}

export function openStore(dir: string) {
  const file = path.join(dir, 'store.json');
  const uploads = path.join(dir, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });

  const read = (): StoreData => {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { floorImports: d.floorImports || [], kv: d.kv || {} };
    } catch (e: any) {
      if (e?.code === 'ENOENT') return { floorImports: [], kv: {} };
      throw e; // a corrupt store must not be silently replaced by an empty one
    }
  };
  // Write to a temp file then rename, so a crash mid-write cannot truncate the store.
  const write = (d: StoreData) => {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d, null, 1));
    fs.renameSync(tmp, file);
  };
  const update = <T>(fn: (d: StoreData) => T): T => { const d = read(); const out = fn(d); write(d); return out; };

  /** Saves a data: URL under uploads/ and returns its file name. */
  const saveUpload = (id: string, dataUrl: string): { name: string; mime: string } => {
    const m = dataUrl.match(/^data:([\w.+/-]+);base64,(.+)$/s);
    if (!m) throw new Error('File must be a base64 data URL');
    const ext = ({ 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' } as Record<string, string>)[m[1]];
    if (!ext) throw new Error(`Unsupported file type ${m[1]}`);
    const name = `${id}.${ext}`;
    fs.writeFileSync(path.join(uploads, name), Buffer.from(m[2], 'base64'));
    return { name, mime: m[1] };
  };
  const readUploadDataUrl = (name: string): string => {
    const ext = path.extname(name).slice(1);
    const mime = ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' } as Record<string, string>)[ext] || 'application/octet-stream';
    return `data:${mime};base64,${fs.readFileSync(path.join(uploads, path.basename(name))).toString('base64')}`;
  };
  const removeUpload = (name: string) => { try { fs.unlinkSync(path.join(uploads, path.basename(name))); } catch { /* already gone */ } };

  return { read, update, saveUpload, readUploadDataUrl, removeUpload, uploadsDir: uploads };
}
