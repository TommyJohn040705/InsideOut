/**
 * The guided way-finding panels: a short form ("I am at / I want to go to") and step-by-step
 * directions. These are what most people see inside a building.
 */
import React, { useState } from 'react';
import { Accessibility, ArrowUpDown, Bath, ChevronLeft, DoorOpen, MapPinned, MessageSquareText, ScanLine, X } from 'lucide-react';
import type { NavigationRoute, RoomPOI } from '../types/navigation';
import { cx, ManeuverIcon, roomTitle } from './Panels';
import { condenseSteps } from '../utils/condenseSteps';
import type { Nearest } from '../utils/tellInWords';

const Field = ({ label, value, placeholder, onClick, extra }: { label: string; value: string | null; placeholder: string; onClick: () => void; extra?: React.ReactNode }) => (
  <div>
    <p className="text-[13px] font-bold text-slate-800 mb-1">{label}</p>
    <div className="flex gap-2">
      <button onClick={onClick} className={cx('flex-1 min-w-0 h-12 px-3 rounded-xl ring-1 text-left text-[15px] truncate', value ? 'ring-slate-400 bg-white text-slate-900 font-semibold' : 'ring-slate-300 bg-white text-slate-400')}>
        {value || placeholder}
      </button>
      {extra}
    </div>
  </div>
);

export function FindForm(props: {
  buildingName: string;
  start: RoomPOI | null; end: RoomPOI | null; route: NavigationRoute | null; routeError: string | null;
  accessible: boolean; onToggleAccessible: () => void;
  onPickStart: () => void; onPickEnd: () => void; onScan: () => void;
  onNearest: (n: Nearest) => void; onShowWay: () => void;
  onWords: (text: string) => string | null;
  onReport: () => void; onChangeBuilding: () => void;
}) {
  const [words, setWords] = useState<string | null>(null); // null: form; string: "tell us in words" box
  const [msg, setMsg] = useState<string | null>(null);
  if (words !== null) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button aria-label="Back to the form" onClick={() => { setWords(null); setMsg(null); }} className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100"><ChevronLeft className="w-5 h-5" /></button>
          <p className="text-lg font-extrabold text-slate-900">Tell us in words</p>
        </div>
        <p className="text-sm text-slate-600">Tell me where you are and where you want to go. For example: "I'm at 2416 and I need room 5338."</p>
        <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} aria-label="Your message" placeholder="Your message"
          className="w-full rounded-xl ring-1 ring-slate-300 p-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-600" />
        {msg && <p role="alert" className="text-sm text-amber-900 bg-amber-50 rounded-lg p-2">{msg}</p>}
        <button disabled={!words.trim()} onClick={() => { const m = props.onWords(words); setMsg(m); if (!m) { setWords(null); } }}
          className="w-full h-12 rounded-xl bg-slate-900 text-white font-bold disabled:bg-slate-300">Send</button>
      </div>
    );
  }
  const ready = props.start && props.end;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button aria-label="Change building" onClick={props.onChangeBuilding} className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100"><ChevronLeft className="w-5 h-5" /></button>
        <p className="text-lg font-extrabold text-slate-900 truncate">{props.buildingName}</p>
      </div>
      <Field label="I am at" value={props.start ? roomTitle(props.start) : null} placeholder="Room number" onClick={props.onPickStart}
        extra={<button onClick={props.onScan} className="h-12 px-3 rounded-xl ring-1 ring-slate-300 text-sm font-semibold text-slate-800 flex items-center gap-1.5 shrink-0"><ScanLine className="w-4 h-4" /> Scan sign</button>} />
      <Field label="I want to go to" value={props.end ? roomTitle(props.end) : null} placeholder="Where to? (room number)" onClick={props.onPickEnd} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-600">or nearest</span>
        {([['restroom', 'Washroom', Bath], ['elevator', 'Elevator', ArrowUpDown], ['exit', 'Exit', DoorOpen]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => props.onNearest(k)} className="h-9 px-3 rounded-full ring-1 ring-slate-300 bg-white text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Icon className="w-4 h-4" /> {l}</button>
        ))}
      </div>
      <label className={cx('flex items-start gap-3 rounded-xl p-3 ring-2 cursor-pointer', props.accessible ? 'bg-blue-50 ring-blue-600' : 'bg-white ring-slate-300')}>
        <input type="checkbox" checked={props.accessible} onChange={props.onToggleAccessible} className="mt-0.5 w-5 h-5 accent-blue-700" />
        <span>
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-slate-900"><Accessibility className="w-4 h-4" /> Elevators only (step-free)</span>
          <span className="block text-xs text-slate-600 mt-0.5">Uses elevators, never stairs. The plans don't show ramps or door openers.</span>
        </span>
      </label>
      {props.routeError && ready && <p role="alert" className="text-sm text-red-800 bg-red-50 rounded-lg p-2">{props.routeError}</p>}
      {props.route && ready && <p className="text-sm text-slate-700">{Math.max(1, Math.round(props.route.estimatedWalkTimeMinutes))} min · about {Math.round(props.route.totalDistanceMeters)} m{new Set(props.route.floorSegments.map((s) => s.floor)).size > 1 ? ` · floors ${[...new Set(props.route.floorSegments.map((s) => s.floor))].join(' → ')}` : ''}</p>}
      <button disabled={!ready || !props.route} onClick={props.onShowWay} className="w-full h-12 rounded-xl bg-slate-900 text-white text-[15px] font-bold disabled:bg-slate-300">
        Show the way
      </button>
      <button onClick={() => setWords('')} className="w-full text-sm font-semibold text-blue-700 flex items-center justify-center gap-1.5"><MessageSquareText className="w-4 h-4" /> Tell us in words instead</button>
      <div className="pt-1 border-t border-slate-100 flex justify-center">
        <button onClick={props.onReport} className="text-sm font-semibold text-blue-800 flex items-center gap-1.5 py-1"><MapPinned className="w-4 h-4" /> Locked door or broken elevator? Update the map</button>
      </div>
    </div>
  );
}

export function DirectionsView({ route, end, current, onPick, onEnd, onChangeDestination, onReport }: {
  route: NavigationRoute; end: RoomPOI; current: number; onPick: (i: number) => void;
  onEnd: () => void; onChangeDestination: () => void; onReport: () => void;
}) {
  // Plain steps (turns, stairs/elevators, arrival); the map follows the router step each came from.
  const plain = condenseSteps(route.steps);
  let i = 0;
  plain.forEach((p, k) => { if (p.index <= current) i = k; });
  const step = plain[i];
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onEnd} className="h-9 px-3 rounded-full ring-1 ring-slate-300 text-sm font-semibold flex items-center gap-1"><X className="w-4 h-4" /> End</button>
      </div>
      <div className="rounded-xl bg-slate-900 text-white p-4 flex items-center gap-3" aria-live="polite">
        <span className="w-10 h-10 shrink-0 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center"><ManeuverIcon step={step.step} className="w-5 h-5" /></span>
        <span className="text-[16px] font-bold leading-snug">{step.text}</span>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={i === 0} onClick={() => onPick(plain[i - 1].index)} className="flex-1 h-11 rounded-full ring-1 ring-slate-300 font-semibold text-slate-800 disabled:text-slate-400 disabled:ring-slate-200">Back</button>
        <span className="text-sm text-slate-600 tabular-nums px-1">{i + 1} of {plain.length}</span>
        <button disabled={i === plain.length - 1} onClick={() => onPick(plain[i + 1].index)} className="flex-1 h-11 rounded-full bg-slate-900 text-white font-semibold disabled:bg-slate-300">Next</button>
      </div>
      <p className="text-sm text-slate-700">{roomTitle(end)}: about {Math.round(route.totalDistanceMeters)} m, {Math.max(1, Math.round(route.estimatedWalkTimeMinutes))} min.</p>
      {route.flaggedNotes?.map((n) => <p key={n} className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">{n}</p>)}
      <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">All steps</p>
      <ol className="space-y-1">
        {plain.map((p, k) => (
          <li key={p.index}>
            <button onClick={() => onPick(p.index)} className={cx('w-full text-left flex gap-3 px-3 py-2 rounded-xl', k === i ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-slate-50')}>
              <span className={cx('w-7 h-7 shrink-0 rounded-full text-xs font-bold flex items-center justify-center', k === i ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-600')}>{k + 1}</span>
              <span className="text-sm text-slate-800 leading-snug pt-1">{p.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between pt-1">
        <button onClick={onChangeDestination} className="text-sm font-semibold text-blue-700">Change destination</button>
        <button onClick={onReport} className="text-sm font-semibold text-blue-800 flex items-center gap-1"><MapPinned className="w-4 h-4" /> Update the map</button>
      </div>
    </div>
  );
}
