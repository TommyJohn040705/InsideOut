/**
 * Link floors: say by hand which stair or elevator is the same one on each floor, for buildings whose
 * drawings could not be matched automatically (sheets of different shapes, floors not on the map).
 */
import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Footprints, Trash2, ExternalLink, Link2 } from 'lucide-react';
import type { FloorImport, ManualShaft } from '../../campus/floorImports';
import { floorLabelOf } from '../../campus/floorImports';

const where = (x: number, y: number) => `${y < 33 ? 'top' : y > 66 ? 'bottom' : 'middle'} ${x < 33 ? 'left' : x > 66 ? 'right' : 'centre'}`;
const isShaft = (c: string) => c === 'elevator' || c === 'stairs';

export function LinkFloors({ buildingName, floors, links, onSave }: {
  buildingName: string;
  /** This building's imported floors. */
  floors: FloorImport[];
  links: ManualShaft[];
  onSave: (links: ManualShaft[]) => void;
}) {
  const sorted = useMemo(() => [...floors].sort((a, b) => a.floorNumber - b.floorNumber), [floors]);
  const [type, setType] = useState<'elevator' | 'stairs'>('elevator');
  const [pick, setPick] = useState<Record<number, string>>({});
  const chosen = Object.entries(pick).filter(([, id]) => id).map(([floor, roomId]) => ({ floor: Number(floor), roomId }));
  const label = (f: FloorImport) => floorLabelOf(f.floorCode, f.sourceName);
  const roomName = (floor: number, id: string) => {
    const r = sorted.find((f) => f.floorNumber === floor)?.rooms.find((x) => x.id === id);
    return r ? r.roomNumber || r.name : '?';
  };

  const save = () => {
    if (chosen.length < 2) return;
    onSave([...links, { id: `m-${Date.now()}`, type, rooms: chosen }]);
    setPick({});
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 leading-snug">
        <b>{buildingName}</b>: pick the <b>same</b> {type === 'elevator' ? 'elevator' : 'staircase'} on each floor it serves (use the drawings to check), then save.
        Routes can then go between those floors. Leave a floor blank if it doesn't stop there.
      </p>

      <div role="radiogroup" aria-label="Type" className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(['elevator', 'stairs'] as const).map((t) => (
          <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}
            className={`flex-1 h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${type === t ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
            {t === 'elevator' ? <ArrowUpDown className="w-3.5 h-3.5" /> : <Footprints className="w-3.5 h-3.5" />} {t === 'elevator' ? 'Elevator' : 'Stairs'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((f) => {
          const shafts = f.rooms.filter((r) => isShaft(r.category)).sort((a, b) => (a.category === type ? 0 : 1) - (b.category === type ? 0 : 1));
          const others = f.rooms.filter((r) => !isShaft(r.category) && r.roomNumber).sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || ''));
          return (
            <div key={f.id} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-bold text-slate-700">Fl {label(f)}</span>
              <select aria-label={`Floor ${label(f)}`} value={pick[f.floorNumber] || ''} onChange={(e) => setPick((p) => ({ ...p, [f.floorNumber]: e.target.value }))}
                className="flex-1 min-w-0 h-9 rounded-lg ring-1 ring-slate-300 bg-white text-xs px-2">
                <option value="">Not on this floor</option>
                {shafts.length > 0 && <optgroup label="Stairs and elevators found">
                  {shafts.map((r) => <option key={r.id} value={r.id}>{r.category === 'elevator' ? 'Elevator' : 'Stairs'} {r.roomNumber || ''} · {where(r.coords.x, r.coords.y)}</option>)}
                </optgroup>}
                {others.length > 0 && <optgroup label="Other rooms (if the shaft wasn't found)">
                  {others.map((r) => <option key={r.id} value={r.id}>{r.roomNumber} · {where(r.coords.x, r.coords.y)}</option>)}
                </optgroup>}
              </select>
              <a href={f.imageUrl} target="_blank" rel="noreferrer" aria-label={`Open floor ${label(f)} drawing`} className="p-1.5 text-indigo-700"><ExternalLink className="w-4 h-4" /></a>
            </div>
          );
        })}
      </div>

      <button disabled={chosen.length < 2} onClick={save}
        className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:bg-slate-300 flex items-center justify-center gap-1.5">
        <Link2 className="w-4 h-4" /> Save link ({chosen.length} floor{chosen.length === 1 ? '' : 's'})
      </button>

      {links.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-700">Linked by hand</p>
          {links.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
              {m.type === 'elevator' ? <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" /> : <Footprints className="w-3.5 h-3.5 text-slate-600" />}
              <span className="flex-1 min-w-0 truncate">{m.rooms.map((r) => `${r.floor}: ${roomName(r.floor, r.roomId)}`).join(' · ')}</span>
              <button aria-label="Delete this link" onClick={() => onSave(links.filter((x) => x.id !== m.id))} className="p-1 text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
