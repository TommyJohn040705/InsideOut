import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, ExternalLink, Navigation2, Globe } from 'lucide-react';
import { FloorPlanData, RoomPOI } from '../types/navigation';
import { answerLocally } from '../utils/localAssistant';
import { E5_FACTS, factText } from '../data/e5/facts';
import { cx } from './Panels';

interface Msg { role: 'user' | 'bot'; text: string; room?: RoomPOI; sources?: { title: string; url: string }[]; offline?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  plan: FloorPlanData;
  plans: FloorPlanData[];
  start: RoomPOI | null;
  accessible: boolean;
  isE5: boolean;
  onGo: (room: RoomPOI) => void;
  onLookup: () => void;
}

const SUGGEST = ['Nearest washroom', 'Where can I get food?', 'Nearest elevator', 'Where is 2108?', 'Closest exit'];

export function Assistant({ open, onClose, plan, plans, start, accessible, isE5, onGo, onLookup }: Props) {
  const building = plan.buildingName || plan.title;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && msgs.length === 0)
      setMsgs([{ role: 'bot', text: `Hi! Ask me about ${building}: the nearest washroom, elevator or exit, food, or where a room is.${start ? ` I'll start from ${start.roomNumber || start.name}.` : ''}` }]);
  }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const findRoom = (id?: string) => {
    if (!id) return undefined;
    for (const p of plans) { const r = p.rooms.find((x) => x.id === id); if (r) return { ...r, floor: r.floor ?? p.floorNumber }; }
    return undefined;
  };

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', text: t }]);
    const local = answerLocally(t, start, plans, accessible, isE5);
    if (local) { setMsgs((m) => [...m, { role: 'bot', text: local.answer, room: local.room, sources: local.sources }]); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/ask-wayfinder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlan: plan, question: t, currentRoomId: start?.id,
          allFloors: plans.map((p) => ({ floorNumber: p.floorNumber, title: p.title, rooms: p.rooms })),
          buildingFacts: isE5 ? E5_FACTS.map(factText) : [],
        }),
      });
      if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('offline');
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'failed');
      setMsgs((m) => [...m, { role: 'bot', text: data.answer, room: findRoom(data.suggestedDestinationId) }]);
    } catch {
      setMsgs((m) => [...m, {
        role: 'bot', offline: true,
        text: "I can't reach the AI server right now. I can still answer: nearest washroom, elevator, stairs or exit, food, and \"where is room 1234\". To find out what a room is used for, try Update the map.",
      }]);
    } finally { setBusy(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md h-[85dvh] sm:h-[640px] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center"><Sparkles className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-slate-900">Ask FloorNav</p>
            <p className="text-xs text-slate-500 truncate">{building}{start ? ` · from ${start.roomNumber || start.name} (floor ${start.floor})` : ''}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug', m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-900 rounded-bl-md')}>
                <p>{m.text}</p>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {m.sources.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-blue-700"><ExternalLink className="w-3 h-3" />{s.title}</a>
                    ))}
                  </div>
                )}
                {m.room && (
                  <button onClick={() => { onGo(m.room!); onClose(); }} className="mt-2 h-9 px-3 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center gap-1.5">
                    <Navigation2 className="w-3.5 h-3.5 fill-current" /> Directions to {m.room.roomNumber || m.room.name}
                  </button>
                )}
                {m.offline && (
                  <button onClick={() => { onClose(); onLookup(); }} className="mt-2 h-9 px-3 rounded-full ring-1 ring-slate-300 bg-white text-sm font-semibold flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> Update the map
                  </button>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-slate-500">Thinking…</div>}
          <div ref={endRef} />
        </div>
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {SUGGEST.map((s) => (
            <button key={s} onClick={() => ask(s)} className="shrink-0 h-8 px-3 rounded-full ring-1 ring-slate-200 text-sm text-slate-700 hover:bg-slate-50">{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="p-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask where to go…" className="flex-1 h-12 px-4 rounded-full ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-[16px]" />
          <button aria-label="Send" type="submit" className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center"><Send className="w-5 h-5" /></button>
        </form>
      </div>
    </div>
  );
}
