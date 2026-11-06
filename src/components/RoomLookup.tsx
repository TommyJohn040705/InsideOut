import React, { useEffect, useRef, useState } from 'react';
import { Camera, Search, X, ExternalLink, Check, Loader2, AlertTriangle, Globe, UserCheck } from 'lucide-react';
import { POICategory, RoomPOI } from '../types/navigation';
import { catLabel, cx } from './Panels';

/**
 * Look up what a room is for: type a room number / description or take a photo of the room sign.
 * The server searches the web (Gemini + Google Search) and returns a proposal with sources.
 * Nothing is saved until the person approves it.
 */

export interface LookupResult {
  roomNumber: string;
  name: string;
  category: POICategory;
  purpose: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  notes: string;
  sources: { title: string; url: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  buildingName: string;
  rooms: RoomPOI[];
  initialRoom?: RoomPOI | null;
  onSave: (room: RoomPOI, result: LookupResult) => void;
  onSaveStaff: (room: RoomPOI, info: { name?: string; purpose: string; category?: POICategory; photo?: string }) => void;
  onShowRoom: (room: RoomPOI) => void;
}

const TYPES: POICategory[] = ['classroom', 'lab', 'workshop', 'office', 'conference', 'restroom', 'study', 'utility', 'other'];

const CONF: Record<string, { label: string; cls: string }> = {
  high: { label: 'Strong match', cls: 'bg-green-50 text-green-800 ring-green-200' },
  medium: { label: 'Likely', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  low: { label: 'Weak evidence', cls: 'bg-orange-50 text-orange-800 ring-orange-200' },
  none: { label: 'Nothing found', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

async function shrinkData(dataUrl: string, max: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = dataUrl; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

async function shrink(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export function RoomLookup({ open, onClose, buildingName, rooms, initialRoom, onSave, onSaveStaff, onShowRoom }: Props) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [type, setType] = useState<POICategory | ''>('');
  const [staffSaved, setStaffSaved] = useState<RoomPOI | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (query: string, image: string | null) => {
    setBusy(true); setError(null); setResult(null); setSaved(false);
    try {
      const num = query.match(/\b(\d{4}[a-z]?)\b/i)?.[1];
      const r = await fetch('/api/lookup-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building: buildingName, roomNumber: num, text: query || undefined, image: image || undefined }),
      });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) throw new Error('offline');
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Lookup failed');
      setResult(data);
    } catch (e: any) {
      setError(e?.message === 'offline' || e?.name === 'TypeError'
        ? 'Web lookup needs the app server (Gemini with Google Search). It works in the AI Studio version, not on this preview page.'
        : e?.message || 'Lookup failed');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!open) return;
    setPhoto(null); setResult(null); setError(null); setSaved(false); setType(''); setStaffSaved(null);
    setText(initialRoom ? `${initialRoom.roomNumber || ''} ` : '');
  }, [open, initialRoom?.id]);

  const findRoom = (n: string) => rooms.find((r) => (r.roomNumber || '').toUpperCase() === n.toUpperCase()) || null;

  const saveMine = async () => {
    setError(null); setResult(null); setStaffSaved(null);
    let num = text.match(/\b(\d{4}[a-z]?)\b/i)?.[1] || initialRoom?.roomNumber || '';
    let signName = '';
    if (!num && photo) {
      setBusy(true);
      try {
        const r = await fetch('/api/read-sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: photo }) });
        if ((r.headers.get('content-type') || '').includes('json') && r.ok) { const d = await r.json(); num = d.roomNumber || ''; signName = d.name || ''; }
      } catch { /* offline: fall through to the message below */ } finally { setBusy(false); }
    }
    if (!num) { setError('Type the room number too (for example "4027 custodian closet"), so I know which room to update.'); return; }
    const room = findRoom(num);
    if (!room) { setError(`Room ${num} isn't on this map, so it can't be updated.`); return; }
    const purpose = text.replace(/\bE5[\s-]*/gi, '').replace(new RegExp(`\\b${num}\\b`, 'i'), '').replace(/^[\s,:.-]+/, '').trim();
    if (!purpose && !photo && !type) { setError('Type what the room is or what is in it, add a photo, or pick a room type.'); return; }
    const generic = /^room\b/i.test(room.name) || room.name.includes(num) && room.name.length < 16;
    const shortName = purpose.split(/[.\n]/)[0].slice(0, 48);
    const small = photo ? await shrinkData(photo, 480) : undefined;
    onSaveStaff(room, {
      name: signName || (generic && shortName ? shortName.charAt(0).toUpperCase() + shortName.slice(1) : undefined),
      purpose: purpose || room.purpose || '',
      category: type || undefined,
      photo: small,
    });
    setStaffSaved(room);
  };

  if (!open) return null;

  const match = result ? rooms.find((r) => (r.roomNumber || '').toUpperCase() === result.roomNumber.toUpperCase()) || initialRoom || null : null;
  const canSave = !!result && !!match && result.confidence !== 'none' && !!result.purpose;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"><Globe className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-slate-900">{initialRoom ? `Update E5 ${initialRoom.roomNumber || ''}` : 'Look up or update a room'}</p>
            <p className="text-xs text-slate-500 truncate">Search the web, or save what you know about a room in {buildingName}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim() || photo) run(text.trim(), photo); }} className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder={initialRoom ? 'What is this room? e.g. "custodian closet, keys at front desk"' : 'Room number and what it is, e.g. "4027 custodian closet" or just "2108" to search'}
              className="w-full rounded-2xl ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none p-3 text-[16px] resize-none"
            />
            {photo && (
              <div className="relative inline-block">
                <img src={photo} alt="Room sign" className="h-24 rounded-xl ring-1 ring-slate-200" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <button type="button" onClick={() => fileRef.current?.click()} className="h-10 px-4 rounded-full ring-1 ring-slate-300 text-slate-800 font-semibold flex items-center gap-2 text-sm">
                <Camera className="w-4 h-4" /> {photo ? 'Retake photo' : 'Add photo'}
              </button>
              <select value={type} onChange={(e) => setType(e.target.value as POICategory | '')} aria-label="Room type"
                className="h-10 flex-1 min-w-0 rounded-full ring-1 ring-slate-300 bg-white px-3 text-sm text-slate-800">
                <option value="">Room type (optional)</option>
                {TYPES.map((t) => <option key={t} value={t}>{catLabel(t)}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveMine} disabled={busy || (!text.trim() && !photo && !initialRoom)}
                className="flex-1 h-11 rounded-full bg-green-600 disabled:bg-slate-300 text-white font-bold flex items-center justify-center gap-2">
                <UserCheck className="w-4 h-4" /> Save my info
              </button>
              <button type="submit" disabled={busy || (!text.trim() && !photo)} className="flex-1 h-11 rounded-full bg-blue-600 disabled:bg-slate-300 text-white font-bold flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {busy ? 'Working…' : 'Search the web'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400"><b>Save my info</b> updates the room right away, marked "Reported by staff". <b>Search the web</b> finds online sources first.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrink(f)); e.target.value = ''; }} />
          </form>

          {staffSaved && (
            <div className="rounded-2xl bg-green-50 ring-1 ring-green-200 p-3 flex items-center gap-3">
              <Check className="w-5 h-5 text-green-700" />
              <p className="flex-1 text-sm text-green-900 font-semibold">Saved to E5 {staffSaved.roomNumber}. It now shows as "Reported by staff".</p>
              <button onClick={() => onShowRoom(staffSaved)} className="h-9 px-3 rounded-full bg-white ring-1 ring-green-300 text-sm font-semibold">Show</button>
            </div>
          )}
          {error && <p className="text-sm rounded-xl bg-amber-50 text-amber-900 p-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</p>}

          {result && (
            <div className="rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-extrabold text-slate-900">{result.roomNumber ? `E5 ${result.roomNumber}` : 'Room'}{result.name ? ` · ${result.name}` : ''}</p>
                  <p className="text-sm text-slate-500">{catLabel(result.category)}{match ? ` · Floor ${match.floor}` : ''}</p>
                </div>
                <span className={cx('text-xs font-bold px-2 py-1 rounded-full ring-1 whitespace-nowrap', CONF[result.confidence].cls)}>{CONF[result.confidence].label}</span>
              </div>
              {result.purpose ? <p className="text-[15px] text-slate-800 leading-snug">{result.purpose}</p> : <p className="text-sm text-slate-500">No reliable information found online. If you know what this room is, type it above and tap <b>Save my info</b>.</p>}
              {result.notes && <p className="text-xs text-slate-500">{result.notes}</p>}
              {result.sources.length > 0 ? (
                <ul className="space-y-1">
                  {result.sources.map((s) => (
                    <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-blue-700 font-semibold inline-flex items-center gap-1 break-all"><ExternalLink className="w-3.5 h-3.5 shrink-0" />{s.title}</a></li>
                  ))}
                </ul>
              ) : <p className="text-xs text-orange-700">No web sources were returned, so treat this as unverified.</p>}
              {!match && result.roomNumber && <p className="text-xs text-slate-500">Room {result.roomNumber} isn't on this map, so it can't be saved here.</p>}
              <div className="flex gap-2 pt-1">
                {saved ? (
                  <span className="flex-1 h-11 rounded-full bg-green-50 text-green-800 font-bold flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Saved to map</span>
                ) : (
                  <button disabled={!canSave} onClick={() => { if (match) { onSave(match, result); setSaved(true); } }}
                    className="flex-1 h-11 rounded-full bg-green-600 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Approve and save
                  </button>
                )}
                {match && <button onClick={() => onShowRoom(match)} className="h-11 px-4 rounded-full ring-1 ring-slate-300 font-semibold">Show on map</button>}
              </div>
              <p className="text-[11px] text-slate-400">Saved info is marked "found online, approved by you" until staff confirm it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
