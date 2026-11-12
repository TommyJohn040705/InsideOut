/**
 * Bulk floor-plan import. Files come from the user's disk or from data-sources/plantops/pdfs on
 * the server (saved there by a UW account holder). Each file is matched to buildings and floors
 * (bulkMatch.ts); exact Plant Operations names go straight to the queue, anything else waits for a
 * person to confirm. Restricted documents are skipped unless the batch has Plant Operations
 * permission. Each imported floor gets rooms from the PDF text layer, optionally Gemini, and the
 * alignment of an already aligned floor of the same building and sheet size (marked as copied).
 */
import React, { useMemo, useState } from 'react';
import { FolderOpen, Upload, Play, Lock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { BUILDINGS, buildingById, type CampusBuilding } from '../../campus/campusData';
import { matchFile, type FileMatch } from '../../campus/bulkMatch';
import { FloorImport, georefOfImport, roomNumberLabels } from '../../campus/floorImports';
import type { POICategory, RoomPOI } from '../../types/navigation';

type State = 'ready' | 'review' | 'permission' | 'skipped' | 'importing' | 'done' | 'failed';
interface Item {
  key: string;
  name: string;
  source: File | { server: string };
  match: FileMatch;
  targets: { buildingId: string; floorCode: string; floorNumber: number | null; manifestFilename: string | null; restricted: boolean }[];
  state: State;
  msg: string;
}

const floorNumberOf = (code: string) => (/^B(\d)$/i.test(code) ? -Number(code.slice(1)) : /^\d+$/.test(code) ? Number(code) : null);
const STATE_STYLE: Record<State, string> = {
  ready: 'bg-sky-50 text-sky-800', review: 'bg-amber-50 text-amber-900', permission: 'bg-rose-50 text-rose-800', skipped: 'bg-slate-100 text-slate-500',
  importing: 'bg-indigo-50 text-indigo-800', done: 'bg-emerald-50 text-emerald-800', failed: 'bg-red-50 text-red-800',
};

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `${r.status} ${r.statusText}`);
  return d;
}

export function BulkImport({ imports, onChanged }: { imports: FloorImport[]; onChanged: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [auth, setAuth] = useState('');
  const [permitRestricted, setPermitRestricted] = useState(false);
  const [useGemini, setUseGemini] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = (key: string, p: Partial<Item>) => setItems((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const classify = (name: string, source: Item['source']): Item => {
    const match = matchFile(name);
    const targets = match.targets.map((t) => ({ buildingId: t.building.id, floorCode: t.floorCode, floorNumber: floorNumberOf(t.floorCode), manifestFilename: t.floor?.filename || null, restricted: !!t.floor?.restricted }));
    const already = targets.length > 0 && targets.every((t) => imports.some((f) => f.buildingId === t.buildingId && (t.manifestFilename ? f.manifestFilename === t.manifestFilename : f.sourceName === name)));
    let state: State = match.confidence === 'exact' ? 'ready' : 'review';
    let msg = match.reason;
    if (already) { state = 'skipped'; msg = 'Already imported.'; }
    else if (targets.some((t) => t.floorNumber == null)) { state = 'review'; msg = `${match.reason} Floor ${targets[0]?.floorCode} needs a floor number.`; }
    else if (targets.some((t) => t.restricted)) { state = 'permission'; msg = 'Restricted by Plant Operations: needs the permission box below.'; }
    return { key: `${name}-${Math.random().toString(36).slice(2, 7)}`, name, source, match, targets, state, msg };
  };

  const addFiles = (files: FileList | null) => { if (files) setItems((l) => [...l, ...Array.from(files).map((f) => classify(f.name, f))]); };
  const scanServer = async () => {
    setNote(null);
    try {
      const list: { name: string }[] = await api('/api/plantops-folder');
      if (!list.length) { setNote('data-sources/plantops/pdfs on the server is empty. Someone with a UW login saves Plant Operations PDFs there.'); return; }
      setItems((l) => [...l, ...list.filter((f) => !l.some((x) => x.name === f.name)).map((f) => classify(f.name, { server: f.name }))]);
    } catch (e: any) { setNote(e?.message || String(e)); }
  };

  const confirm = (it: Item, buildingId: string, floorCode: string, floorNumber: string) => {
    const b = buildingById(buildingId);
    const n = Number(floorNumber);
    if (!b || !floorCode || !Number.isFinite(n)) return;
    const mf = b.floors.find((f) => f.floorCode === floorCode) || null;
    set(it.key, { targets: [{ buildingId, floorCode, floorNumber: n, manifestFilename: mf?.filename === it.name ? mf.filename : null, restricted: !!mf?.restricted }], state: mf?.restricted ? 'permission' : 'ready', msg: 'Confirmed by you.' });
  };

  const fileOf = async (it: Item): Promise<File> => {
    if (it.source instanceof File) return it.source;
    const r = await fetch(`/api/plantops-folder/${encodeURIComponent(it.source.server)}`);
    if (!r.ok) throw new Error(`Could not read ${it.source.server} from the server folder`);
    const blob = await r.blob();
    return new File([blob], it.name, { type: blob.type || (/\.pdf$/i.test(it.name) ? 'application/pdf' : '') });
  };

  const run = async () => {
    if (!auth.trim()) { setNote('Say who authorized this batch first.'); return; }
    setRunning(true); setNote(null);
    const { readFloorPlanFile } = await import('../../campus/readFloorPlanFile');
    // Imports made during this run count as alignment sources for later files of the same building.
    let known: FloorImport[] = [...imports];
    for (const it of items) {
      const go = it.state === 'ready' || (it.state === 'permission' && permitRestricted);
      if (!go) continue;
      set(it.key, { state: 'importing', msg: 'Reading the document…' });
      try {
        const read = await readFloorPlanFile(await fileOf(it));
        const done: string[] = [];
        for (const t of it.targets) {
          let rec: FloorImport = await api('/api/floor-imports', { method: 'POST', body: JSON.stringify({
            buildingId: t.buildingId, floorCode: t.floorCode, floorNumber: t.floorNumber, manifestFilename: t.manifestFilename, restricted: t.restricted,
            authorization: auth, fileName: it.name, fileDataUrl: read.fileDataUrl, imageDataUrl: read.imageDataUrl, imageSize: read.imageSize, pdfLabels: read.labels,
          }) });
          const patch: Partial<FloorImport> = {};
          const labels = roomNumberLabels(rec.pdfLabels);
          if (labels.length) patch.rooms = labels.map((l, i) => ({ id: `${rec.id}-t${i}-${l.text.replace(/\W/g, '')}`, name: `Room ${l.text}`, roomNumber: l.text, category: 'other' as POICategory, coords: { x: l.x, y: l.y }, floor: rec.floorNumber, purposeVerification: 'unverified_drawing_only' } as RoomPOI));
          // Plant Operations sheets of one building share a frame when their size matches; reuse that alignment, flagged for checking.
          const src = known.find((f) => f.buildingId === rec.buildingId && f.id !== rec.id && f.imageSize[0] === rec.imageSize[0] && f.imageSize[1] === rec.imageSize[1] && georefOfImport(f) && !f.alignmentFrom);
          if (src) Object.assign(patch, { controlPoints: src.controlPoints, alignmentFrom: src.id });
          if (Object.keys(patch).length) rec = await api(`/api/floor-imports/${rec.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
          if (useGemini) { try { rec = await api(`/api/floor-imports/${rec.id}/extract`, { method: 'POST' }); } catch (e: any) { done.push(`Gemini: ${e.message}`); } }
          known = [...known, rec];
          done.push(`${t.buildingId} ${t.floorCode}: ${rec.rooms.length} rooms${src ? `, alignment copied from floor ${src.floorCode}` : ', needs alignment'}`);
        }
        set(it.key, { state: 'done', msg: done.join(' · ') });
      } catch (e: any) {
        set(it.key, { state: 'failed', msg: e?.message || String(e) });
      }
      onChanged();
    }
    setRunning(false);
  };

  const publishAligned = async () => {
    const ids = imports.filter((f) => !f.published && georefOfImport(f)).map((f) => f.id);
    for (const id of ids) await api(`/api/floor-imports/${id}`, { method: 'PATCH', body: JSON.stringify({ published: true }) }).catch(() => {});
    onChanged();
    setNote(`${ids.length} aligned floors published as drafts (marked "not reviewed").`);
  };

  const counts = useMemo(() => items.reduce((m, x) => ({ ...m, [x.state]: (m[x.state] || 0) + 1 }), {} as Record<State, number>), [items]);
  const codes = useMemo(() => BUILDINGS.filter((b) => b.code && b.footprint).sort((a, b) => a.code!.localeCompare(b.code!)), []);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="flex-1 h-10 rounded-xl ring-1 ring-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50">
          <Upload className="w-4 h-4" /> Add files
          <input type="file" multiple accept="application/pdf,image/svg+xml,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} aria-label="Add floor-plan files" />
        </label>
        <button onClick={scanServer} className="flex-1 h-10 rounded-xl ring-1 ring-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50"><FolderOpen className="w-4 h-4" /> Server folder</button>
      </div>
      <p className="text-[11px] text-slate-500">Plant Operations PDFs need a UW login. Download them yourself (or have someone with access do it) and add them here or save them in <code>data-sources/plantops/pdfs/</code> on the server. Nothing is downloaded from UW by this app.</p>
      {note && <p role="status" className="text-xs bg-slate-50 rounded-lg p-2">{note}</p>}

      {items.length > 0 && (
        <>
          <div className="text-[11px] text-slate-600">{items.length} files · {Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(' · ')}</div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-200 rounded-lg">
            {items.map((it) => (
              <li key={it.key} className="p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate font-semibold">{it.name}</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${STATE_STYLE[it.state]}`}>{it.state === 'importing' ? <Loader2 className="inline w-3 h-3 animate-spin" /> : it.state}</span>
                </div>
                <div className="text-slate-500">{it.targets.length ? it.targets.map((t) => `${t.buildingId} ${t.floorCode}${t.restricted ? ' (restricted)' : ''}`).join(', ') + ' · ' : ''}{it.msg}</div>
                {it.state === 'review' && <ReviewRow it={it} codes={codes} onConfirm={confirm} onSkip={() => set(it.key, { state: 'skipped', msg: 'Skipped by you.' })} />}
              </li>
            ))}
          </ul>
          <input value={auth} onChange={(e) => setAuth(e.target.value)} placeholder="Batch authorized by (name and basis), required" aria-label="Batch authorization" className="w-full h-9 rounded-lg bg-slate-100 px-2 text-sm" />
          {items.some((x) => x.state === 'permission') && (
            <label className="flex items-start gap-2 text-xs text-rose-900 bg-rose-50 rounded-lg p-2">
              <input type="checkbox" checked={permitRestricted} onChange={(e) => setPermitRestricted(e.target.checked)} className="mt-0.5" />
              <span><Lock className="inline w-3.5 h-3.5" /> Plant Operations gave permission to use the restricted documents in this batch. Without this they are skipped.</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={useGemini} onChange={(e) => setUseGemini(e.target.checked)} /> Also ask Gemini for rooms and hallways (slower; needs GEMINI_API_KEY on the server)</label>
          <button disabled={running} onClick={run} className="w-full h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-1.5 disabled:bg-slate-300">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Import {(counts.ready || 0) + (permitRestricted ? counts.permission || 0 : 0)} files
          </button>
        </>
      )}
      <button onClick={publishAligned} className="w-full h-9 rounded-xl ring-1 ring-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50"><CheckCircle2 className="w-4 h-4" /> Publish every aligned, unpublished import (as draft)</button>
      <p className="text-[11px] text-slate-500 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> A floor reaches the map only once it has control points. The first floor of each building is aligned by hand in its record; later sheets of the same size reuse it and say so.</p>
    </div>
  );
}

function ReviewRow({ it, codes, onConfirm, onSkip }: { it: Item; codes: CampusBuilding[]; onConfirm: (it: Item, b: string, f: string, n: string) => void; onSkip: () => void }) {
  const t = it.targets[0];
  const [b, setB] = useState(t?.buildingId || '');
  const [f, setF] = useState(t?.floorCode || '');
  const [n, setN] = useState(t?.floorNumber != null ? String(t.floorNumber) : '');
  const floors = buildingById(b)?.floors || [];
  return (
    <div className="flex gap-1 items-center">
      <select aria-label="Building" value={b} onChange={(e) => setB(e.target.value)} className="h-7 rounded bg-slate-100 text-xs max-w-24"><option value="">Building…</option>{codes.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select>
      <input aria-label="Floor code" value={f} onChange={(e) => { setF(e.target.value.toUpperCase()); const k = floorNumberOf(e.target.value.toUpperCase()); if (k != null) setN(String(k)); }} list={`fl-${it.key}`} placeholder="Floor" className="h-7 w-14 rounded bg-slate-100 px-1 text-xs" />
      <datalist id={`fl-${it.key}`}>{floors.map((x) => <option key={x.id} value={x.floorCode} />)}</datalist>
      <input aria-label="Floor number" value={n} onChange={(e) => setN(e.target.value)} placeholder="No." className="h-7 w-10 rounded bg-slate-100 px-1 text-xs" />
      <button onClick={() => onConfirm(it, b, f, n)} className="h-7 px-2 rounded bg-slate-900 text-white text-[11px] font-bold">Confirm</button>
      <button onClick={onSkip} className="h-7 px-2 rounded ring-1 ring-slate-200 text-[11px]">Skip</button>
    </div>
  );
}
