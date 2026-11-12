import React, { useEffect, useRef, useState } from 'react';
import { buildingCode } from './Panels';
import {
  Camera, X, Check, Loader2, AlertTriangle, Globe, Send, MapPinned, Flag, Map as MapIcon, Sparkles, ExternalLink, Trash2,
} from 'lucide-react';
import { POICategory, RoomPOI } from '../types/navigation';
import { catLabel, cx } from './Panels';
import { MapChange, parseLocally } from '../utils/contribute';
import { RoomReport, reportLabel } from '../utils/reports';
import { MicButton } from './MicButton';

/**
 * One place to add anything to the map: type, add a photo or a file.
 * AI (or the offline parser) turns it into proposed changes; nothing changes until the person taps Save.
 *   - what a room is      -> room info, marked "Reported by staff"
 *   - a problem           -> report shown on the room (Still there / Fixed)
 *   - a whole floor plan  -> AI builds a new map from it
 *   - "Search the web"    -> looks the room up online with sources
 */

export interface WebResult {
  roomNumber: string; name: string; category: POICategory; purpose: string;
  confidence: 'high' | 'medium' | 'low' | 'none'; notes: string; sources: { title: string; url: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  buildingName: string;
  rooms: RoomPOI[];
  initialRoom?: RoomPOI | null;
  initialText?: string;
  onSaveStaff: (room: RoomPOI, info: { name?: string; purpose: string; category?: POICategory; photo?: string }) => void;
  onSaveWeb: (room: RoomPOI, r: WebResult) => void;
  onReport: (r: RoomReport) => void;
  onFloorPlan: (image: string) => Promise<void>;
  onShowRoom: (room: RoomPOI) => void;
}

type Item = MapChange & { id: string; state: 'new' | 'saved' | 'busy' | 'error'; error?: string; web?: WebResult };

const QUICK = ['Elevator not working', 'Door locked', 'Hallway blocked', 'Needs cleaning', 'Room info is wrong'];
const CATS: string[] = ['classroom', 'lab', 'workshop', 'office', 'conference', 'restroom', 'study', 'utility', 'elevator', 'stairs', 'other'];

async function toDataUrl(file: File, max: number, q = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  } finally { URL.revokeObjectURL(url); }
}
async function shrinkData(dataUrl: string, max: number) {
  const blob = await (await fetch(dataUrl)).blob();
  return toDataUrl(new File([blob], 'p.jpg', { type: blob.type }), max, 0.72);
}
const isJson = (r: Response) => (r.headers.get('content-type') || '').includes('json');

export function UpdateMap(props: Props) {
  const { open, onClose, buildingName, rooms, initialRoom, initialText, onSaveStaff, onSaveWeb, onReport, onFloorPlan, onShowRoom } = props;
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText || ''); setPhoto(null); setItems([]); setNote(null); setBusy(false);
  }, [open, initialRoom?.id, initialText]);

  if (!open) return null;

  const find = (n?: string) => (n ? rooms.find((r) => (r.roomNumber || '').toUpperCase() === n.toUpperCase()) || null : null);
  const patch = (id: string, p: Partial<Item>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const mk = (c: MapChange): Item => ({ ...c, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, state: 'new' });

  const send = async () => {
    const t = text.trim();
    if (!t && !photo) return;
    setBusy(true); setNote(null); setItems([]);
    let changes: MapChange[] | null = null;
    try {
      const r = await fetch('/api/contribute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: buildingName, text: t || undefined, image: photo || undefined, roomNumber: initialRoom?.roomNumber,
          rooms: rooms.filter((x) => x.roomNumber).map((x) => ({ n: x.roomNumber, name: x.name })),
        }),
      });
      if (r.ok && isJson(r)) {
        const d = await r.json();
        changes = d.changes || [];
        if (!changes!.length) setNote(d.message || "I couldn't tell what to change. Add a room number, or describe the problem.");
      }
    } catch { /* offline: fall back below */ }
    if (changes === null) {
      changes = parseLocally(t, initialRoom || null);
      if (photo && !changes.length && !t) {
        setNote('AI is offline here, so I can\'t read the photo. Type the room number and what it is, or tap "This is a floor plan".');
      } else if (!changes.length) {
        setNote('AI is offline here. Include a room number (e.g. "4027 custodian closet") or describe the problem (e.g. "elevator 1802 not working").');
      } else {
        setNote('Sorted on your phone (AI is offline). Check it before saving.');
      }
      if (photo && changes.length && changes[0].kind === 'room_update') changes[0] = { ...changes[0] };
    }
    setItems(changes.map(mk));
    setBusy(false);
  };

  const saveItem = async (it: Item) => {
    if (it.kind === 'floor_plan') {
      if (!photo) return;
      patch(it.id, { state: 'busy' });
      try { await onFloorPlan(photo); patch(it.id, { state: 'saved' }); }
      catch (e: any) { const m = String(e?.message || ''); patch(it.id, { state: 'error', error: /fetch|JSON|Failed to analyze|Unexpected/i.test(m) ? 'Building a map from a photo needs the AI Studio server.' : m || 'Could not build the map.' }); }
      return;
    }
    const room = find(it.roomNumber) || (it.roomNumber ? null : initialRoom || null);
    if (it.kind === 'report') {
      onReport({
        id: `rep-${Date.now()}`, roomId: room?.id || null,
        roomLabel: room ? `${buildingCode(room)} ${room.roomNumber || room.name}` : 'General', floor: room?.floor ?? null,
        type: it.reportType || 'other', details: it.details || '', createdAt: new Date().toISOString(), confirmations: 1,
      });
      patch(it.id, { state: 'saved' });
      return;
    }
    if (!room) return;
    const small = photo ? await shrinkData(photo, 480) : undefined;
    onSaveStaff(room, {
      name: it.name || undefined, purpose: it.purpose || '',
      category: (CATS.includes(String(it.category)) ? it.category : undefined) as POICategory | undefined,
      photo: small,
    });
    patch(it.id, { state: 'saved' });
  };

  const webSearch = async (it: Item) => {
    const room = find(it.roomNumber) || initialRoom;
    patch(it.id, { state: 'busy', error: undefined });
    try {
      const r = await fetch('/api/lookup-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building: buildingName, roomNumber: room?.roomNumber || it.roomNumber, text: it.purpose || text || undefined }),
      });
      if (!isJson(r)) throw new Error('offline');
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Search failed');
      patch(it.id, { state: 'new', web: d });
    } catch (e: any) {
      patch(it.id, { state: 'new', error: e?.message === 'offline' || e?.name === 'TypeError' ? 'Web search needs the AI Studio server.' : e?.message });
    }
  };

  const addFloorPlanItem = () => setItems((l) => (l.some((x) => x.kind === 'floor_plan') ? l : [...l, mk({ kind: 'floor_plan' })]));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-green-50 text-green-700 flex items-center justify-center"><MapPinned className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-slate-900">Update the map</p>
            <p className="text-xs text-slate-500 truncate">{initialRoom ? `${buildingCode(initialRoom)} ${initialRoom.roomNumber || ''} · ${initialRoom.name}` : buildingName}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={initialRoom
              ? 'What is this room, or what is wrong? e.g. "custodian closet" or "door is locked"'
              : 'Type anything, e.g. "4027 is the custodian closet" or "elevator 1802 not working". Or add a photo of a room sign or a floor plan.'}
            className="w-full rounded-2xl ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none p-3 text-[16px] resize-none"
          />
          <div className="flex items-center justify-between gap-2 -mt-1 px-1">
            <div className="flex items-center gap-2">
              <MicButton
                size="sm"
                title="Dictate update"
                onFinalTranscript={(words) => {
                  if (words.trim()) {
                    setText((prev) => (prev.trim() ? `${prev.trim()} ${words.trim()}` : words.trim()));
                  }
                }}
              />
              <span className="text-xs text-slate-500 font-medium">Add by voice</span>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {QUICK.map((q) => (
              <button key={q} onClick={() => setText((t) => (t.trim() ? `${t.trim()}. ${q}` : `${initialRoom ? '' : ''}${q}`))}
                className="shrink-0 h-8 px-3 rounded-full ring-1 ring-slate-200 text-sm text-slate-700 hover:bg-slate-50">{q}</button>
            ))}
          </div>
          {photo && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src={photo} alt="Attached" className="h-20 rounded-xl ring-1 ring-slate-200" />
                <button aria-label="Remove photo" onClick={() => { setPhoto(null); setItems((l) => l.filter((x) => x.kind !== 'floor_plan')); }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={addFloorPlanItem} className="h-9 px-3 rounded-full ring-1 ring-slate-300 text-sm font-semibold flex items-center gap-1.5"><MapIcon className="w-4 h-4" /> This is a floor plan</button>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => camRef.current?.click()} aria-label="Take photo" className="w-11 h-11 shrink-0 rounded-full ring-1 ring-slate-300 flex items-center justify-center text-slate-700"><Camera className="w-5 h-5" /></button>
            <button onClick={() => fileRef.current?.click()} className="h-11 px-4 rounded-full ring-1 ring-slate-300 text-slate-800 font-semibold text-sm">Upload file</button>
            <button onClick={send} disabled={busy || (!text.trim() && !photo)}
              className="flex-1 h-11 rounded-full bg-blue-600 disabled:bg-slate-300 text-white font-bold flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {busy ? 'Reading…' : 'Continue'}
            </button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await toDataUrl(f, 1800)); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await toDataUrl(f, 2400)); e.target.value = ''; }} />

          {note && <p className="text-sm rounded-xl bg-amber-50 text-amber-900 p-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{note}</p>}

          {items.length > 0 && <p className="text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Check and save</p>}
          {items.map((it) => {
            const room = find(it.roomNumber) || (!it.roomNumber ? initialRoom || null : null);
            const missing = it.kind !== 'floor_plan' && it.roomNumber && !room;
            const saved = it.state === 'saved';
            return (
              <div key={it.id} className={cx('rounded-2xl ring-1 p-4 space-y-2', saved ? 'ring-green-300 bg-green-50' : 'ring-slate-200')}>
                <div className="flex items-start gap-2">
                  <span className={cx('w-8 h-8 shrink-0 rounded-lg flex items-center justify-center',
                    it.kind === 'report' ? 'bg-rose-50 text-rose-600' : it.kind === 'floor_plan' ? 'bg-purple-50 text-purple-700' : 'bg-green-50 text-green-700')}>
                    {it.kind === 'report' ? <Flag className="w-4 h-4" /> : it.kind === 'floor_plan' ? <MapIcon className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    {it.kind === 'room_update' && (
                      <>
                        <p className="font-bold text-slate-900">Update {room ? `${buildingCode(room)} ${room.roomNumber}` : `room ${it.roomNumber || '?'}`}</p>
                        {it.name && <p className="text-[15px] text-slate-800">{it.name}{it.category && CATS.includes(String(it.category)) ? <span className="text-slate-500"> · {catLabel(String(it.category))}</span> : null}</p>}
                        {it.purpose && it.purpose !== it.name && <p className="text-sm text-slate-600">{it.purpose}</p>}
                      </>
                    )}
                    {it.kind === 'report' && (
                      <>
                        <p className="font-bold text-slate-900">{reportLabel(it.reportType || 'other')}</p>
                        <p className="text-sm text-slate-600">{room ? `${buildingCode(room)} ${room.roomNumber} · ${room.name}` : 'No room given: saved as a general report'}</p>
                        {it.details && <p className="text-sm text-slate-600">"{it.details}"</p>}
                      </>
                    )}
                    {it.kind === 'floor_plan' && (
                      <>
                        <p className="font-bold text-slate-900">Add as a new floor plan</p>
                        <p className="text-sm text-slate-600">AI reads the rooms and hallways in the photo and adds a new map you can check and fix.</p>
                      </>
                    )}
                  </div>
                </div>
                {missing && <p className="text-xs text-orange-700">Room {it.roomNumber} isn't on this map, so it can't be saved.</p>}
                {it.error && <p className="text-xs text-orange-700">{it.error}</p>}
                {it.web && (
                  <div className="rounded-xl bg-blue-50 p-3 text-sm space-y-1">
                    <p className="font-semibold text-blue-900 flex items-center gap-1.5"><Globe className="w-4 h-4" /> Found online ({it.web.confidence})</p>
                    <p className="text-blue-900">{it.web.purpose || 'Nothing reliable found online.'}</p>
                    {it.web.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 font-semibold truncate"><ExternalLink className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{s.title}</span></a>)}
                    {room && it.web.purpose && it.web.confidence !== 'none' && (
                      <button onClick={() => { onSaveWeb(room, it.web!); patch(it.id, { state: 'saved' }); }} className="mt-1 h-9 px-3 rounded-full bg-blue-600 text-white font-bold">Use this instead</button>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  {saved ? (
                    <>
                      <span className="flex-1 h-10 rounded-full bg-white text-green-800 font-bold flex items-center justify-center gap-1.5 ring-1 ring-green-300"><Check className="w-4 h-4" /> Saved</span>
                      {room && <button onClick={() => onShowRoom(room)} className="h-10 px-4 rounded-full bg-white ring-1 ring-slate-300 font-semibold">Show</button>}
                    </>
                  ) : (
                    <>
                      <button disabled={!!missing || it.state === 'busy' || (it.kind === 'room_update' && !room)} onClick={() => saveItem(it)}
                        className={cx('flex-1 h-10 rounded-full text-white font-bold disabled:bg-slate-200 disabled:text-slate-500 flex items-center justify-center gap-1.5',
                          it.kind === 'report' ? 'bg-rose-600' : it.kind === 'floor_plan' ? 'bg-purple-600' : 'bg-green-600')}>
                        {it.state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {it.kind === 'report' ? 'Submit report' : it.kind === 'floor_plan' ? 'Build map' : 'Save'}
                      </button>
                      {it.kind === 'room_update' && room && !it.web && (
                        <button onClick={() => webSearch(it)} className="h-10 px-3 rounded-full ring-1 ring-slate-300 text-sm font-semibold flex items-center gap-1.5"><Globe className="w-4 h-4" /> Search web</button>
                      )}
                      <button aria-label="Discard" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} className="w-10 h-10 rounded-full ring-1 ring-slate-200 text-slate-500 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {items.length === 0 && !note && (
            <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5"><Send className="w-4 h-4" /> You can add</p>
              <p>• What a room is: "4027 custodian closet, keys at front desk"</p>
              <p>• A problem: "elevator 1802 not working", "north door locked"</p>
              <p>• A photo of a room sign, or a whole floor plan to map a new building</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
