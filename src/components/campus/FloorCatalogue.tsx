/**
 * The Plant Operations floor-plan catalogue (Wayfinder manifest) inside the app: every document,
 * searchable by building code, name, floor or filename, with what has actually been done with it.
 */
import React, { useMemo, useState } from 'react';
import { Lock, ExternalLink } from 'lucide-react';
import { BUILDINGS, FLOOR_STATUS_LABEL, INDOOR } from '../../campus/campusData';
import { FloorImport, importStatus } from '../../campus/floorImports';

export function FloorCatalogue({ imports, onOpen, onImport }: { imports: FloorImport[]; onOpen: (importId: string) => void; onImport: (buildingId: string, floorCode: string) => void }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => BUILDINGS.flatMap((b) => b.floors.map((f) => ({ b, f }))), []);
  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = rows.filter(({ b, f }) => {
      const hay = `${b.code || ''} ${b.name || ''} ${f.floorCode} ${f.wing || ''} ${f.filename} ${f.restricted ? 'restricted' : ''}`.toLowerCase();
      // A lone digit means a floor ("DC 2"), not any "2" in a filename.
      return words.every((w) => (/^\d$/.test(w) ? f.floorCode === `0${w}` : hay.includes(w)));
    });
    return out;
  }, [q, rows]);
  const docs = new Set(rows.map((r) => r.f.filename)).size;

  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: DC 2, MC B1, REV EH, restricted…" aria-label="Search the floor-plan catalogue" className="w-full h-9 rounded-lg bg-slate-100 px-2 text-sm" />
      <div className="text-[11px] text-slate-500">{docs} Plant Operations documents (Wayfinder manifest) · {hits.length} rows shown{hits.length > 150 ? ' (first 150)' : ''}. Links open plantops.uwaterloo.ca and need a UW login.</div>
      <ul className="max-h-[55dvh] overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-200 rounded-lg">
        {hits.slice(0, 150).map(({ b, f }) => {
          const imp = imports.find((x) => x.buildingId === b.id && (x.manifestFilename === f.filename || (!x.manifestFilename && x.floorCode === f.floorCode)));
          const traced = INDOOR[b.id] && f.indoorFloor != null;
          return (
            <li key={`${b.id}-${f.id}`} className="px-2 py-1.5 text-xs flex items-center gap-2">
              <span className="w-12 font-extrabold">{b.code || b.id}</span>
              <span className="w-12">{f.wing ? `${f.wing} ` : ''}{f.floorCode}</span>
              <span className="flex-1 min-w-0 truncate text-slate-500" title={f.filename}>{f.restricted && <Lock className="inline w-3 h-3 mr-0.5" />}{f.filename}{f.drawingSet ? ` (shared: ${f.drawingSet})` : ''}</span>
              {traced ? <span className="text-[10px] font-bold text-emerald-800">Traced, on map</span>
                : imp ? <button onClick={() => onOpen(imp.id)} className="text-[10px] font-bold text-indigo-700">{FLOOR_STATUS_LABEL[importStatus(imp)]}{imp.published ? ' · map' : ''}</button>
                : b.footprint ? <button onClick={() => onImport(b.id, f.floorCode)} className="text-[10px] font-bold text-slate-600">Not imported</button>
                : <span className="text-[10px] text-slate-400" title={b.gap?.note}>Not on map</span>}
              <a href={f.url} target="_blank" rel="noreferrer" aria-label={`Open ${f.filename} at Plant Operations (UW login)`} className="text-slate-400 hover:text-slate-700"><ExternalLink className="w-3.5 h-3.5" /></a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
