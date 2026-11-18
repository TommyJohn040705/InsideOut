import React, { useEffect, useState } from 'react';
import { Compass, Search, Navigation2, Sparkles, UserCheck, Flag, X, ChevronLeft } from 'lucide-react';
import { cx } from './Panels';

/** First-visit walkthrough of how FloorNav works. Shown once; "Show the tour" in the menu reopens it. */

const KEY = 'floornav.tourSeen.v1';
export const tourSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } };

const STEPS = [
  {
    icon: Compass, color: 'bg-amber-400 text-slate-900',
    title: 'Welcome to FloorNav',
    body: 'Indoor maps and directions for Engineering 5 (E5), built from the official floor plans. Made for staff who need to get to a room fast and keep room info up to date.',
    points: [] as string[],
  },
  {
    icon: Search, color: 'bg-blue-600 text-white',
    title: 'Find any room',
    body: 'Search a room number, a name or a type like "washroom" or "lab".',
    points: ['Tap a floor number to switch floors', 'Tap any room on the map to see what it is', 'Pinch to zoom, drag to move'],
  },
  {
    icon: Navigation2, color: 'bg-blue-600 text-white',
    title: 'Get walking directions',
    body: 'Tap Directions, then Start. The route stays in the hallways and takes the elevator between floors.',
    points: ['The map follows you and changes floors at the elevator', '"Elevators only" keeps routes step-free', 'Tap a step to jump to it'],
  },
  {
    icon: Sparkles, color: 'bg-amber-400 text-slate-900',
    title: 'Ask FloorNav',
    body: 'Ask in plain words: "nearest washroom", "where can I get food?", "where is 3101?". Common questions work even without internet.',
    points: [],
  },
  {
    icon: UserCheck, color: 'bg-green-600 text-white',
    title: 'Keep the map up to date',
    body: 'Open Update the map and type anything or add a photo: what a room is, a problem like a locked door, or a whole floor plan. AI sorts it out and you check it before it saves.',
    points: ['Room info shows as "Reported by staff"', 'Problems show on the room until someone marks them fixed'],
  },
];

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(0); }, [open]);
  if (!open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const done = () => { markSeen(); onClose(); };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="How FloorNav works">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-slate-400">{i + 1} of {STEPS.length}</span>
          <button onClick={done} className="h-9 px-3 -mr-2 rounded-full text-sm font-semibold text-slate-500 hover:bg-slate-100 flex items-center gap-1">
            Skip <X className="w-4 h-4" />
          </button>
        </div>
        <div className={cx('w-14 h-14 rounded-2xl flex items-center justify-center mb-4', s.color)}>
          <s.icon className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">{s.title}</h2>
        <p className="text-[16px] text-slate-600 mt-2 leading-relaxed">{s.body}</p>
        {s.points.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {s.points.map((p) => (
              <li key={p} className="flex gap-2 text-[15px] text-slate-700"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />{p}</li>
            ))}
          </ul>
        )}
        {i === STEPS.length - 1 && (
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5"><Flag className="w-3.5 h-3.5" /> You can see this again from the menu: Show the tour.</p>
        )}
        <div className="flex items-center gap-2 mt-6">
          <div className="flex gap-1.5 flex-1">
            {STEPS.map((_, k) => (
              <button key={k} aria-label={`Step ${k + 1}`} onClick={() => setI(k)} className={cx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300')} />
            ))}
          </div>
          {i > 0 && (
            <button aria-label="Back" onClick={() => setI(i - 1)} className="w-12 h-12 rounded-full ring-1 ring-slate-300 flex items-center justify-center text-slate-700"><ChevronLeft className="w-5 h-5" /></button>
          )}
          <button onClick={() => (last ? done() : setI(i + 1))} className="h-12 px-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold">
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
