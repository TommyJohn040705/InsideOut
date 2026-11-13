/**
 * Floor-plan studio: upload an authorized floor-plan document for a campus building, read it,
 * extract rooms (PDF text layer and/or Gemini), review them, place control points against the
 * live campus map, and publish the floor so it appears on the map and in the indoor navigator.
 * Every step is stored on the server (server.ts /api/floor-imports).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Lock, Sparkles, Trash2, Crosshair, CheckCircle2, AlertTriangle, Eye, FileText } from 'lucide-react';
import { BUILDINGS, FLOOR_STATUS_LABEL, buildingById } from '../../campus/campusData';
import { FloorImport, georefOfImport, graphProblems, importStatus, roomNumberLabels } from '../../campus/floorImports';
import type { CampusMapAdapter, FloorOverlay } from '../../campus/map/types';
import type { ControlPoint, Px } from '../../campus/georef';
import type { POICategory, RoomPOI } from '../../types/navigation';
import { BulkImport } from './BulkImport';
import { FloorCatalogue } from './FloorCatalogue';

interface Props {
  buildingId: string | null;
  imports: FloorImport[];
  onChanged: () => void;
  adapter: CampusMapAdapter | null;
  onPreview: (o: FloorOverlay | null) => void;
  onClose: () => void;
}

const CATS: POICategory[] = ['classroom', 'lab', 'office', 'conference', 'restroom', 'elevator', 'stairs', 'entrance', 'dining', 'study', 'utility', 'other'] as POICategory[];

/** "B1" -> -1, "03" -> 3; anything else needs the user to say. */
export const floorNumberOf = (code: string) => (/^B(\d)$/i.test(code) ? -Number(code.slice(1)) : /^\d+$/.test(code) ? Number(code) : NaN);

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `${r.status} ${r.statusText}`);
  return d;
}

export function FloorPlanStudio({ buildingId, imports, onChanged, adapter, onPreview, onClose }: Props) {
  const [bId, setBId] = useState(buildingId || 'E5');
  const b = buildingById(bId);
  const [floorCode, setFloorCode] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [auth, setAuth] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingPx, setPendingPx] = useState<Px | null>(null);
  const [tab, setTab] = useState<'single' | 'bulk' | 'catalogue'>('single');
  const imgRef = useRef<HTMLImageElement>(null);

  const rec = imports.find((f) => f.id === openId) || null;
  const mine = imports.filter((f) => f.buildingId === bId);
  const manifestFloor = b?.floors.find((f) => f.floorCode === floorCode) || null;
  const g = rec ? georefOfImport(rec) : null;
  const problems = rec ? graphProblems(rec.rooms, rec.hallways) : [];
  // Other floors of this building drawn on the same sheet frame and not yet aligned.
  const siblings = rec ? imports.filter((x) => x.buildingId === rec.buildingId && x.id !== rec.id && x.imageSize[0] === rec.imageSize[0] && x.imageSize[1] === rec.imageSize[1] && x.controlPoints.length < 2) : [];

  useEffect(() => { if (buildingId) setBId(buildingId); }, [buildingId]);
  useEffect(() => { const n = floorNumberOf(floorCode); setFloorNumber(Number.isNaN(n) ? '' : String(n)); }, [floorCode]);
  // Show the floor being worked on, aligned, even before it is published.
  useEffect(() => { onPreview(rec && g ? { url: rec.imageUrl, imageSize: rec.imageSize, corners: g.corners } : null); }, [rec?.id, rec?.controlPoints.length, rec?.imageUrl]);
  useEffect(() => () => { onPreview(null); adapter?.onMapClick(null); }, []);
  // Bring the building into view so control points can be placed on it.
  useEffect(() => { const c = rec && buildingById(rec.buildingId)?.center; if (c) adapter?.flyTo(c, adapter.provider === 'google' ? 19 : 18); }, [rec?.id]);

  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label); setErr(null);
    try { await f(); onChanged(); } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(null); }
  };

  const upload = () => run('Reading and uploading the document…', async () => {
    if (!file) throw new Error('Choose a file.');
    const n = Number(floorNumber);
    if (!floorCode.trim() || !Number.isFinite(n)) throw new Error('Choose the floor and give its number (basement = -1).');
    // pdf.js is large, so it loads only when someone imports a document.
    const read = await (await import('../../campus/readFloorPlanFile')).readFloorPlanFile(file);
    const created: FloorImport = await api('/api/floor-imports', { method: 'POST', body: JSON.stringify({
      buildingId: bId, floorCode: floorCode.trim(), floorNumber: n, manifestFilename: manifestFloor?.filename || null, restricted: manifestFloor?.restricted ?? false,
      authorization: auth, fileName: file.name, fileDataUrl: read.fileDataUrl, imageDataUrl: read.imageDataUrl, imageSize: read.imageSize, pdfLabels: read.labels,
    }) });
    setOpenId(created.id); setFile(null);
  });

  const patch = (body: Partial<FloorImport>) => run('Saving…', () => api(`/api/floor-imports/${rec!.id}`, { method: 'PATCH', body: JSON.stringify(body) }));
  const setRoom = (i: number, p: Partial<RoomPOI>) => patch({ rooms: rec!.rooms.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  const roomsFromText = () => {
    const found = roomNumberLabels(rec!.pdfLabels);
    if (!found.length) { setErr('No room numbers were found in this document\'s text layer.'); return; }
    const seen = new Set(rec!.rooms.map((r) => r.roomNumber));
    const add: RoomPOI[] = found.filter((l) => !seen.has(l.text)).map((l, i) => ({
      id: `${rec!.id}-t${i}-${l.text.replace(/\W/g, '')}`, name: `Room ${l.text}`, roomNumber: l.text, category: 'other' as POICategory,
      coords: { x: l.x, y: l.y }, floor: rec!.floorNumber, purposeVerification: 'unverified_drawing_only',
    } as RoomPOI));
    patch({ rooms: [...rec!.rooms, ...add] });
  };

  // Control point: click the drawing, then the same spot on the map.
  const clickImage = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!rec || !adapter || busy) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px: Px = [Math.round(((e.clientX - box.left) / box.width) * rec.imageSize[0]), Math.round(((e.clientY - box.top) / box.height) * rec.imageSize[1])];
    setPendingPx(px);
    adapter.onMapClick((at) => {
      setPendingPx(null);
      const cp: ControlPoint = { px, lngLat: [+at[0].toFixed(7), +at[1].toFixed(7)], note: 'Placed in the floor-plan studio by matching the drawing to the map' };
      patch({ controlPoints: [...rec.controlPoints, cp] });
    });
  };

  const statusChip = (f: FloorImport) => (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{FLOOR_STATUS_LABEL[importStatus(f)]}{f.published ? ' · published' : ''}</span>
  );

  const textRooms = useMemo(() => (rec ? roomNumberLabels(rec.pdfLabels).length : 0), [rec]);

  return (
    <div role="dialog" aria-label="Floor-plan studio" className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 flex flex-col max-h-full overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-slate-100">
        <FileText className="w-5 h-5 text-indigo-600" />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-slate-900 leading-tight">Floor-plan studio</div>
          <div className="text-[11px] text-slate-500">Import, extract, align, review, publish</div>
        </div>
        <button aria-label="Close floor-plan studio" onClick={onClose} className="p-1 text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
      </div>

      <div className="overflow-y-auto p-3 space-y-3 text-sm">
        {err && <p role="alert" className="text-xs font-semibold text-red-800 bg-red-50 rounded-lg p-2">{err}</p>}
        {busy && <p role="status" className="text-xs font-semibold text-indigo-800 bg-indigo-50 rounded-lg p-2">{busy}</p>}

        {!rec && (
          <div role="tablist" className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {([['single', 'One floor'], ['bulk', 'Bulk import'], ['catalogue', 'Catalogue']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 h-8 rounded-lg text-xs font-bold ${tab === k ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>{l}</button>
            ))}
          </div>
        )}
        {!rec && tab === 'bulk' && <BulkImport imports={imports} onChanged={onChanged} />}
        {!rec && tab === 'catalogue' && <FloorCatalogue imports={imports} onOpen={(id) => { setOpenId(id); }} onImport={(b, code) => { setBId(b); setFloorCode(code); setTab('single'); }} />}
        {!rec && tab === 'single' && (
          <>
            <label className="block">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Building</span>
              <select value={bId} onChange={(e) => { setBId(e.target.value); setFloorCode(''); }} className="mt-1 w-full h-9 rounded-lg bg-slate-100 px-2 text-sm font-semibold">
                {BUILDINGS.filter((x) => x.code).sort((x, y) => x.code!.localeCompare(y.code!)).map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
              </select>
            </label>

            {mine.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">Imported floors</div>
                <ul className="space-y-1">
                  {mine.map((f) => (
                    <li key={f.id}><button onClick={() => setOpenId(f.id)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 ring-1 ring-slate-200 flex items-center gap-2">
                      <span className="font-bold">Floor {f.floorCode}</span><span className="flex-1 truncate text-xs text-slate-500">{f.sourceName}</span>{statusChip(f)}
                    </button></li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-500 uppercase pt-2">Import a floor plan</div>
              <div className="flex gap-2">
                <select aria-label="Floor" value={floorCode} onChange={(e) => setFloorCode(e.target.value)} className="flex-1 h-9 rounded-lg bg-slate-100 px-2 text-sm">
                  <option value="">Floor…</option>
                  {b?.floors.map((f) => <option key={f.id} value={f.floorCode}>{f.floorCode} · {f.filename}{f.restricted ? ' (restricted)' : ''}</option>)}
                </select>
                <input aria-label="Floor number" value={floorNumber} onChange={(e) => setFloorNumber(e.target.value)} placeholder="No." className="w-16 h-9 rounded-lg bg-slate-100 px-2 text-sm" />
              </div>
              {!b?.floors.length && <input aria-label="Floor code" value={floorCode} onChange={(e) => setFloorCode(e.target.value)} placeholder="Floor code, e.g. 01 or B1" className="w-full h-9 rounded-lg bg-slate-100 px-2 text-sm" />}
              {manifestFloor?.restricted && (
                <p className="text-[11px] text-amber-900 bg-amber-50 rounded-lg p-2 flex gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0 mt-px" />Plant Operations marks this document restricted. Import it only with permission; it is stored on this server and not published as a file.</p>
              )}
              <input type="file" accept="application/pdf,image/svg+xml,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-xs" aria-label="Floor plan file (PDF, SVG or image)" />
              <input value={auth} onChange={(e) => setAuth(e.target.value)} placeholder="Authorized by (name and basis), required" className="w-full h-9 rounded-lg bg-slate-100 px-2 text-sm" aria-label="Authorization" />
              <button disabled={!!busy || !file || !auth.trim() || !floorCode} onClick={upload} className="w-full h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-1.5 disabled:bg-slate-300">
                <Upload className="w-4 h-4" /> Import document
              </button>
              <p className="text-[11px] text-slate-500">PDFs are read in your browser: the first page is rendered and the drawing's own text (room numbers and their positions) is kept. GIS files are not supported yet.</p>
            </div>
          </>
        )}

        {rec && (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => { setOpenId(null); adapter?.onMapClick(null); setPendingPx(null); }} className="text-xs font-bold text-indigo-700">← All floors</button>
              <span className="flex-1" />{statusChip(rec)}
            </div>
            <div className="font-bold">{rec.buildingId} floor {rec.floorCode} <span className="font-normal text-slate-500">(number {rec.floorNumber})</span></div>
            <div className="text-[11px] text-slate-500">{rec.sourceName}{rec.restricted ? ' · restricted document' : ''} · authorized by {rec.authorization} · {rec.imageSize[0]}×{rec.imageSize[1]} px</div>

            <div className="relative ring-1 ring-slate-200 rounded-lg overflow-hidden bg-slate-50">
              <img ref={imgRef} src={rec.imageUrl} alt={`Floor ${rec.floorCode} drawing`} onClick={clickImage} className="w-full cursor-crosshair select-none" draggable={false} />
              {rec.rooms.map((r) => <span key={r.id} title={r.roomNumber || r.name} className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-blue-600 ring-1 ring-white pointer-events-none" style={{ left: `${r.coords.x}%`, top: `${r.coords.y}%` }} />)}
              {rec.controlPoints.map((c, i) => <span key={i} className="absolute -ml-2 -mt-2 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center pointer-events-none" style={{ left: `${(c.px[0] / rec.imageSize[0]) * 100}%`, top: `${(c.px[1] / rec.imageSize[1]) * 100}%` }}>{i + 1}</span>)}
              {pendingPx && <span className="absolute -ml-2 -mt-2 w-4 h-4 rounded-full bg-amber-500 ring-2 ring-white animate-pulse pointer-events-none" style={{ left: `${(pendingPx[0] / rec.imageSize[0]) * 100}%`, top: `${(pendingPx[1] / rec.imageSize[1]) * 100}%` }} />}
            </div>
            {pendingPx
              ? <p className="text-xs font-semibold text-amber-900 bg-amber-50 rounded-lg p-2 flex items-center gap-1.5"><Crosshair className="w-4 h-4" /> Now click the same spot on the map. <button className="underline ml-auto" onClick={() => { setPendingPx(null); adapter?.onMapClick(null); }}>Cancel</button></p>
              : <p className="text-[11px] text-slate-500">Control point: click a recognisable spot on the drawing (a building corner), then the same spot on the map. Two or more are needed; spread them out.</p>}

            <section>
              <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">Alignment</div>
              {g ? (
                <div className="text-xs space-y-1">
                  <div>{rec.controlPoints.length} control points · fit error {g.rmsM.toFixed(2)} m RMS · {(g.metresPerPixel * 1000).toFixed(1)} mm per pixel · {g.xAxisBearingDeg.toFixed(0)}° rotation</div>
                  {rec.controlPoints.length === 2 && <div className="text-amber-800">Two points always fit exactly; add a third to measure the error.</div>}
                  {g.rmsM > 2 && <div className="text-red-700 font-semibold">Fit error over 2 m: check the control points.</div>}
                  <ul className="space-y-0.5">{rec.controlPoints.map((c, i) => (
                    <li key={i} className="flex items-center gap-1.5">#{i + 1} <span className="text-slate-500">px {c.px.join(',')} → {c.lngLat[1].toFixed(6)}, {c.lngLat[0].toFixed(6)} ({g.residualsM[i].toFixed(2)} m)</span>
                      <button aria-label={`Remove control point ${i + 1}`} onClick={() => patch({ controlPoints: rec.controlPoints.filter((_, j) => j !== i) })} className="ml-auto text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></li>
                  ))}</ul>
                </div>
              ) : <div className="text-xs text-slate-500">Not aligned yet ({rec.controlPoints.length} of 2 control points).</div>}
              {rec.alignmentFrom?.startsWith('auto:') && <p className="mt-1 text-[11px] text-amber-900 bg-amber-50 rounded-lg p-2">Automatic fit of the drawing outline to the OpenStreetMap footprint (overlap {Math.round(Number(rec.alignmentFrom.split(':')[1]) * 100)}%). On DC this method landed within about 2 m of a fit from 52 matched rooms; still check the overlay before reviewing.</p>}
              {rec.alignmentFrom && !rec.alignmentFrom.startsWith('auto:') && <p className="mt-1 text-[11px] text-amber-900 bg-amber-50 rounded-lg p-2">Control points copied from floor {imports.find((x) => x.id === rec.alignmentFrom)?.floorCode || rec.alignmentFrom} (same building, same sheet size). Check the overlay before reviewing; replace them if this sheet is framed differently.</p>}
              {g && siblings.length > 0 && (
                <button disabled={!!busy} onClick={() => run(`Copying alignment to ${siblings.length} floors…`, async () => { for (const s of siblings) await api(`/api/floor-imports/${s.id}`, { method: 'PATCH', body: JSON.stringify({ controlPoints: rec.controlPoints, alignmentFrom: rec.id }) }); })}
                  className="mt-1 text-[11px] font-bold text-indigo-700">Copy this alignment to {siblings.length} other unaligned floor{siblings.length > 1 ? 's' : ''} of {rec.buildingId} with the same sheet size</button>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase flex-1">Rooms ({rec.rooms.length}) · hallway nodes {rec.hallways.length}</div>
                {textRooms > 0 && <button disabled={!!busy} onClick={roomsFromText} className="text-[11px] font-bold text-indigo-700">+ {textRooms} from PDF text</button>}
                <button disabled={!!busy} onClick={() => run('Asking Gemini to read the drawing…', () => api(`/api/floor-imports/${rec.id}/extract`, { method: 'POST' }))} className="text-[11px] font-bold text-indigo-700 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Gemini</button>
              </div>
              {rec.extraction && <p className="text-[11px] text-slate-500 mb-1">Gemini ({rec.extraction.model}) extracted rooms and hallways {new Date(rec.extraction.at).toLocaleString()}. AI output: check every room.</p>}
              {problems.length > 0 && <p className="text-[11px] text-amber-900 bg-amber-50 rounded-lg p-2 mb-1"><AlertTriangle className="inline w-3.5 h-3.5" /> No indoor routing on this floor yet: {problems.join(' ')}</p>}
              <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-200 rounded-lg">
                {rec.rooms.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-1 px-1.5 py-1">
                    <input aria-label="Room number" defaultValue={r.roomNumber || ''} onBlur={(e) => e.target.value !== (r.roomNumber || '') && setRoom(i, { roomNumber: e.target.value })} className="w-14 h-7 rounded bg-slate-50 px-1 text-xs" />
                    <input aria-label="Room name" defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && setRoom(i, { name: e.target.value })} className="flex-1 min-w-0 h-7 rounded bg-slate-50 px-1 text-xs" />
                    <select aria-label="Category" value={r.category} onChange={(e) => setRoom(i, { category: e.target.value as POICategory })} className="h-7 rounded bg-slate-50 text-xs">
                      {[...new Set([...CATS, r.category])].map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <button aria-label={`Delete ${r.roomNumber || r.name}`} onClick={() => patch({ rooms: rec.rooms.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
                {!rec.rooms.length && <li className="p-2 text-xs text-slate-500">No rooms yet. Use the PDF text or Gemini above.</li>}
              </ul>
            </section>

            <section className="space-y-2 border-t border-slate-100 pt-2">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={rec.reviewed} disabled={!g || !rec.rooms.length || !!busy} onChange={(e) => patch({ reviewed: e.target.checked })} className="mt-0.5" />
                <span>I compared the aligned drawing with the building footprint (use the eye slider on the map) and checked the rooms. {(!g || !rec.rooms.length) && <span className="text-slate-400">Needs rooms and alignment first.</span>}</span>
              </label>
              <div className="flex gap-2">
                <button disabled={!!busy} onClick={() => patch({ published: !rec.published })} className={`flex-1 h-10 rounded-xl font-bold flex items-center justify-center gap-1.5 ${rec.published ? 'bg-slate-100 text-slate-800' : 'bg-indigo-600 text-white disabled:bg-slate-300'}`}>
                  {rec.published ? <><Eye className="w-4 h-4" /> Unpublish</> : <><CheckCircle2 className="w-4 h-4" /> {g ? 'Publish on the map' : 'Publish (indoor view only until aligned)'}</>}
                </button>
                <button disabled={!!busy} onClick={() => { if (confirm(`Delete the import of ${rec.buildingId} floor ${rec.floorCode} and its stored file? This cannot be undone.`)) run('Deleting…', async () => { await api(`/api/floor-imports/${rec.id}`, { method: 'DELETE' }); setOpenId(null); }); }}
                  className="h-10 px-3 rounded-xl ring-1 ring-slate-200 text-red-700" aria-label="Delete import"><Trash2 className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] text-slate-500">Published floors appear in this building's floor selector{problems.length ? '' : ' and can be routed'}. Labels stay "not walked" until someone checks the route on site.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
