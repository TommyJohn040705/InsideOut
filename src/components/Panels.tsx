import React, { useMemo, useState } from 'react';
import {
  Search, X, ArrowUpDown, Accessibility, Volume2, VolumeX, Play, Pause, RotateCcw, ArrowUp, ArrowLeft, ArrowRight,
  ArrowUpLeft, ArrowUpRight, Flag, CircleDot, ArrowUpFromLine, ArrowDownToLine, Footprints, Clock, MapPin, Navigation2,
  ExternalLink, Pencil, AlertTriangle, BadgeCheck, CircleHelp, Globe, UserCheck,
} from 'lucide-react';
import { ManeuverAction, NavigationRoute, NavigationStep, RoomPOI } from '../types/navigation';
import { CLASSROOM_SPECS } from '../data/waterlooStaffData';
import { Tv, Mic, Laptop, ScanLine } from 'lucide-react';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const CAT_LABEL: Record<string, string> = {
  classroom: 'Classroom', conference: 'Meeting room', lab: 'Lab', workshop: 'Workshop', office: 'Office', restroom: 'Washroom',
  elevator: 'Elevator', stairs: 'Stairs', entrance: 'Entrance', exit: 'Exit', bridge: 'Bridge', study: 'Study space',
  dining: 'Food', utility: 'Service room', reception: 'Reception', other: 'Room',
};
export const catLabel = (c: string) => CAT_LABEL[c] || 'Room';

/** Building code for labels: imported floors carry "import-<CODE>", E5's own rooms have no prefix. */
export const buildingCode = (r: { buildingId?: string } | null | undefined) => (r?.buildingId?.startsWith('import-') ? r.buildingId.slice(7) : 'E5');

export function roomTitle(r: RoomPOI) {
  return r.roomNumber && !r.name.includes(r.roomNumber) ? `${r.roomNumber} · ${r.name}` : r.name;
}

/* ---------------- search ---------------- */
export function useRoomSearch(rooms: RoomPOI[], q: string) {
  return useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const scored: { r: RoomPOI; score: number }[] = [];
    for (const r of rooms) {
      const num = (r.roomNumber || '').toLowerCase();
      const name = r.name.toLowerCase();
      const purpose = (r.purpose || '').toLowerCase();
      const cat = catLabel(r.category).toLowerCase();
      let score = 0;
      if (num === s) score = 100;
      else if (num.startsWith(s)) score = 80;
      else if (name.startsWith(s)) score = 60;
      else if (name.includes(s)) score = 40;
      else if (cat.includes(s)) score = 30;
      else if (purpose.includes(s)) score = 20;

      // Waterloo Workplace keywords
      if (['print', 'uprint', 'copier', 'photocopy'].includes(s)) {
        if (num === '2108' || name.includes('gear') || purpose.includes('print')) score = Math.max(score, 75);
      }
      if (['lounge', 'kitchen', 'microwave', 'coffee', 'lunch'].includes(s)) {
        if (num.includes('3812') || name.includes('commons') || name.includes('lounge') || r.floor === 6) score = Math.max(score, 75);
      }
      if (['av', 'podium', 'projector', 'microphone', 'crestron'].includes(s)) {
        if (['3101', '3102', '2004', '3052', '6005'].includes(num)) score = Math.max(score, 85);
      }
      if (['aed', 'first aid', 'emergency', 'safety', 'defibrillator'].includes(s)) {
        if (['1002', '2811', '3101', '5101', '1810', '1818'].includes(num) || cat === 'exit') score = Math.max(score, 80);
      }
      if (['bridge', 'overpass', 'e3', 'e7', 'link'].includes(s)) {
        if (num === '1808' || num === '3818' || cat === 'bridge' || name.includes('bridge') || name.includes('connection')) score = Math.max(score, 90);
      }

      if (score) scored.push({ r, score: score + (r.purposeVerification === 'verified_official_source' ? 5 : 0) });
    }
    return scored.sort((a, b) => b.score - a.score || (a.r.roomNumber || '').localeCompare(b.r.roomNumber || '')).slice(0, 30).map((x) => x.r);
  }, [rooms, q]);
}

export function SearchResults({ results, onPick, emptyHint }: { results: RoomPOI[]; onPick: (r: RoomPOI) => void; emptyHint?: string }) {
  if (!results.length) return emptyHint ? <p className="px-4 py-6 text-sm text-slate-500 text-center">{emptyHint}</p> : null;
  return (
    <ul className="divide-y divide-slate-100">
      {results.map((r) => (
        <li key={r.id}>
          <button onClick={() => onPick(r)} className="w-full text-left px-4 py-3 hover:bg-slate-50 active:bg-slate-100 flex items-center gap-3">
            <span className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <MapPin className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-900 truncate">{roomTitle(r)}</span>
              <span className="block text-xs text-slate-500 truncate">
                Floor {r.floor} · {catLabel(r.category)}
                {r.purposeVerification === 'verified_official_source' ? ' · Verified' : ''}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus, onClear, onFocus, leading, trailing }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onClear?: () => void; onFocus?: () => void; leading?: React.ReactNode; trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 h-12 px-3 rounded-full bg-white shadow-md ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
      {leading || <Search className="w-5 h-5 text-slate-400 shrink-0" />}
      <input
        value={value}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-[16px] text-slate-900 placeholder:text-slate-400"
        inputMode="search"
        enterKeyHint="search"
      />
      {value && (
        <button aria-label="Clear" onClick={() => { onChange(''); onClear?.(); }} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500">
          <X className="w-4 h-4" />
        </button>
      )}
      {trailing}
    </div>
  );
}

/* ---------------- floor picker ---------------- */
export function FloorPicker({ floors, current, onPick, routeFloors, vertical }: {
  floors: number[]; current: number; onPick: (f: number) => void; routeFloors?: number[]; vertical?: boolean;
}) {
  const list = vertical ? [...floors].sort((a, b) => b - a) : floors;
  return (
    <div data-ui className={cx('bg-white rounded-2xl shadow-md ring-1 ring-slate-200 p-1 flex gap-1', vertical ? 'flex-col' : 'flex-row')}>
      {list.map((f) => (
        <button
          key={f}
          onClick={() => onPick(f)}
          aria-label={`Floor ${f}`}
          className={cx(
            'relative w-10 h-10 rounded-xl text-sm font-bold transition-colors',
            f === current ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
          )}
        >
          {f}
          {routeFloors?.includes(f) && f !== current && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </button>
      ))}
    </div>
  );
}

/* ---------------- maneuvers ---------------- */
export function ManeuverIcon({ step, className }: { step: NavigationStep; className?: string }) {
  const a: ManeuverAction = step.action;
  const c = className || 'w-5 h-5';
  if (a === 'turn-left') return <ArrowLeft className={c} />;
  if (a === 'turn-right') return <ArrowRight className={c} />;
  if (a === 'slight-left') return <ArrowUpLeft className={c} />;
  if (a === 'slight-right') return <ArrowUpRight className={c} />;
  if (a === 'arrive') return <Flag className={c} />;
  if (a === 'start') return <CircleDot className={c} />;
  if (a === 'take-elevator' || a === 'take-stairs') {
    const up = step.floorChange ? step.floorChange.toFloor > step.floorChange.fromFloor : true;
    return up ? <ArrowUpFromLine className={c} /> : <ArrowDownToLine className={c} />;
  }
  return <ArrowUp className={c} />;
}

export function cleanInstruction(s: string) {
  return s.replace(/\s*\(Wheelchair Accessible\)/, '').replace(/ Destination is directly ahead\./, '').replace(/ Head into the corridor\./, '');
}

/* ---------------- route summary + steps ---------------- */
export function RouteSummary({ route }: { route: NavigationRoute }) {
  const floors = Array.from(new Set(route.floorSegments.map((s) => s.floor)));
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-2xl font-extrabold text-slate-900">{Math.max(1, Math.round(route.estimatedWalkTimeMinutes))} min</span>
      <span className="text-sm text-slate-500">{Math.round(route.totalDistanceMeters)} m</span>
      {floors.length > 1 && <span className="text-sm text-slate-500">· Floors {floors.join(' → ')}</span>}
    </div>
  );
}

export function StepsList({ route, current, onPick }: { route: NavigationRoute; current: number; onPick?: (i: number) => void }) {
  return (
    <ol className="relative">
      {route.steps.map((s, i) => (
        <li key={i}>
          <button
            onClick={() => onPick?.(i)}
            className={cx('w-full text-left flex gap-3 px-3 py-2.5 rounded-xl', i === current ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50')}
          >
            <span className={cx('w-8 h-8 shrink-0 rounded-full flex items-center justify-center',
              s.isVerticalTransition ? 'bg-purple-100 text-purple-700' : i === current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600')}>
              <ManeuverIcon step={s} className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-800 leading-snug">{cleanInstruction(s.instruction)}</span>
              {s.isVerticalTransition && <span className="block text-xs text-purple-700 mt-0.5 font-semibold">Floor change</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- route planner ---------------- */
export function RoutePlanner(props: {
  start: RoomPOI | null; end: RoomPOI | null; route: NavigationRoute | null; accessible: boolean; voice: boolean;
  onEditStart: () => void; onEditEnd: () => void; onSwap: () => void; onToggleAccessible: () => void; onToggleVoice: () => void;
  onStart: () => void; onOpenScanner?: () => void; compactSteps?: boolean; current: number; onPickStep?: (i: number) => void;
}) {
  const { start, end, route } = props;
  const [showSteps, setShowSteps] = useState(!props.compactSteps);
  return (
    <div className="space-y-4">
      <div className="flex items-stretch gap-2">
        <div className="flex flex-col items-center py-4">
          <span className="w-3 h-3 rounded-full border-[3px] border-green-600" />
          <span className="flex-1 w-px border-l-2 border-dotted border-slate-300 my-1" />
          <MapPin className="w-4 h-4 text-red-600" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <button onClick={props.onEditStart} className="w-full h-11 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-left text-[15px] truncate">
            {start ? <span className="text-slate-900">{roomTitle(start)} <span className="text-slate-400">· L{start.floor}</span></span> : <span className="text-slate-400">Choose start</span>}
          </button>
          <button onClick={props.onEditEnd} className="w-full h-11 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-left text-[15px] truncate">
            {end ? <span className="text-slate-900">{roomTitle(end)} <span className="text-slate-400">· L{end.floor}</span></span> : <span className="text-slate-400">Choose destination</span>}
          </button>
          {props.onOpenScanner && (
            <button onClick={props.onOpenScanner} className="text-xs font-semibold text-blue-700 flex items-center gap-1 px-1">
              <ScanLine className="w-3.5 h-3.5" /> Set start by scanning a sign or QR code
            </button>
          )}
        </div>
        <button onClick={props.onSwap} aria-label="Swap start and destination" className="self-center p-2 rounded-full hover:bg-slate-100 text-slate-600">
          <ArrowUpDown className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={props.onToggleAccessible}
          className={cx('flex-1 h-10 rounded-full text-sm font-semibold flex items-center justify-center gap-1.5 ring-1',
            props.accessible ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-white text-slate-600 ring-slate-200')}>
          <Accessibility className="w-4 h-4" /> {props.accessible ? 'Elevators only' : 'Stairs OK'}
        </button>
        <button onClick={props.onToggleVoice}
          className={cx('h-10 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5 ring-1',
            props.voice ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-white text-slate-600 ring-slate-200')}>
          {props.voice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} Voice
        </button>
      </div>

      {route && (
        <div className="rounded-2xl ring-1 ring-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <RouteSummary route={route} />
            <button onClick={props.onStart} className="h-11 px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-sm">
              <Navigation2 className="w-4 h-4 fill-current" /> Start
            </button>
          </div>
          {route.flaggedNotes && route.flaggedNotes.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" />{route.flaggedNotes[0]}</p>
          )}
          <button onClick={() => setShowSteps((v) => !v)} className="text-sm font-semibold text-blue-700">
            {showSteps ? 'Hide' : 'Show'} {route.steps.length} steps
          </button>
          {showSteps && <StepsList route={route} current={props.current} onPick={props.onPickStep} />}
        </div>
      )}
    </div>
  );
}

/* ---------------- room card ---------------- */
export interface CardReport { id: string; label: string; details: string; createdAt: string; confirmations: number }

export function RoomCard({ room, onDirections, onStartHere, onEdit, onReport, onLookup, onClose, reports, onConfirmReport, onFixReport }: {
  room: RoomPOI; onDirections: () => void; onStartHere: () => void; onEdit: () => void; onReport: () => void; onLookup?: () => void; onClose?: () => void;
  reports?: CardReport[]; onConfirmReport?: (id: string) => void; onFixReport?: (id: string) => void;
}) {
  const verified = room.purposeVerification === 'verified_official_source';
  const webApproved = room.purposeVerification === 'web_lookup_user_approved';
  const staff = room.purposeVerification === 'staff_reported';
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{room.roomNumber ? `${buildingCode(room)} ${room.roomNumber}` : room.name}</h2>
          <p className="text-[15px] text-slate-700 mt-0.5">{room.name}</p>
          <p className="text-sm text-slate-500 mt-1">Floor {room.floor} · {catLabel(room.category)}{room.accessible ? ' · Accessible' : ''}</p>
        </div>
        {onClose && (
          <button aria-label="Close" onClick={onClose} className="p-2 -m-1 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onDirections} className="flex-1 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2">
          <Navigation2 className="w-4 h-4 fill-current" /> Directions
        </button>
        <button onClick={onStartHere} className="h-11 px-4 rounded-full ring-1 ring-slate-300 text-slate-800 font-semibold hover:bg-slate-50">Start here</button>
      </div>
      <div className={cx('text-sm rounded-xl p-3', verified ? 'bg-green-50 text-green-900' : webApproved ? 'bg-blue-50 text-blue-900' : staff ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600')}>
        <p className="flex items-center gap-1.5 font-semibold">
          {verified ? <BadgeCheck className="w-4 h-4" /> : webApproved ? <Globe className="w-4 h-4" /> : staff ? <UserCheck className="w-4 h-4" /> : <CircleHelp className="w-4 h-4" />}
          {verified ? 'Purpose verified' : webApproved ? 'Found online, approved by you' : staff ? `Reported by staff${room.reportedAt ? ` · ${new Date(room.reportedAt).toLocaleDateString()}` : ''}` : 'Purpose not verified'}
        </p>
        {(verified || webApproved || staff) && room.purpose && <p className="mt-1 leading-snug">{room.purpose}</p>}
        {room.photo && <img src={room.photo} alt={`Photo of ${room.roomNumber || room.name}`} className="mt-2 rounded-lg max-h-40 ring-1 ring-black/5" />}
        {webApproved && room.sources && room.sources.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {room.sources.slice(0, 3).map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700 font-semibold truncate"><ExternalLink className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{s.title}</span></a>
            ))}
          </div>
        ) : (verified || webApproved) && room.sourceUrl && (
          <a href={room.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-blue-700 font-semibold">
            Source <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {!verified && onLookup && (
          <button onClick={onLookup} className="mt-2 h-9 px-3 rounded-full bg-white ring-1 ring-slate-300 text-slate-800 font-semibold inline-flex items-center gap-1.5">
            <Globe className="w-4 h-4" /> {webApproved || staff ? 'Update this room' : 'Add info about this room'}
          </button>
        )}
      </div>

      {/* Classroom & AV Equipment specs if available */}
      {(() => {
        const spec = CLASSROOM_SPECS[room.id] || (room.roomNumber && CLASSROOM_SPECS[`e5-${room.roomNumber}`]);
        if (!spec) return null;
        return (
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-amber-900 flex items-center gap-1.5 text-xs">
                <Tv className="w-4 h-4 text-amber-700" /> Teaching & AV Specs ({spec.capacity} Seats)
              </span>
              <span className="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900">
                Waterloo AV
              </span>
            </div>
            <div className="space-y-1 text-slate-800">
              <p className="font-semibold text-slate-900">{spec.podiumModel}</p>
              <p className="text-slate-600 leading-snug">{spec.displaySetup}</p>
              <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px] text-slate-700">
                <span className="inline-flex items-center gap-1"><Mic className="w-3.5 h-3.5 text-purple-600" /> Lapel mic in drawer</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1"><Laptop className="w-3.5 h-3.5 text-emerald-600" /> HDMI / USB-C / AirMedia</span>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-amber-900 font-bold">
                IST AV Hotline: ext. 44357
              </span>
              <a href="tel:5198884567,44357" className="text-blue-700 font-bold hover:underline">
                Call AV Desk
              </a>
            </div>
          </div>
        );
      })()}
      {reports && reports.length > 0 && (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-900">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{r.label}</p>
              {r.details && <p className="mt-0.5">{r.details}</p>}
              <p className="text-xs text-rose-700 mt-1">Reported {new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{r.confirmations > 1 ? ` · confirmed ${r.confirmations - 1}x` : ''}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => onConfirmReport?.(r.id)} className="h-9 px-3 rounded-full bg-white ring-1 ring-rose-300 font-semibold">Still there</button>
                <button onClick={() => onFixReport?.(r.id)} className="h-9 px-3 rounded-full bg-white ring-1 ring-green-300 text-green-800 font-semibold">Fixed</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-4 text-sm">
        <button onClick={onEdit} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><Pencil className="w-4 h-4" /> Edit</button>
        <button onClick={onReport} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><AlertTriangle className="w-4 h-4" /> Report a problem</button>
      </div>
    </div>
  );
}

/* ---------------- navigation ---------------- */
export function NavBanner({ route, index, onPrev, onNext }: { route: NavigationRoute; index: number; onPrev: () => void; onNext: () => void }) {
  const step = route.steps[index] || route.steps[0];
  const next = route.steps[index + 1];
  return (
    <div data-ui className="rounded-2xl overflow-hidden shadow-xl">
      <div className={cx('flex items-center gap-3 p-3 text-white', step.isVerticalTransition ? 'bg-purple-700' : 'bg-blue-700')}>
        <span className="w-12 h-12 shrink-0 rounded-xl bg-white/15 flex items-center justify-center"><ManeuverIcon step={step} className="w-7 h-7" /></span>
        <p className="flex-1 text-[15px] sm:text-[17px] font-bold leading-snug">{cleanInstruction(step.instruction)}</p>
        <div className="flex flex-col gap-1">
          <button aria-label="Previous step" onClick={onPrev} disabled={index === 0} className="w-8 h-8 rounded-lg bg-white/15 disabled:opacity-30 flex items-center justify-center"><ArrowUp className="w-4 h-4" /></button>
          <button aria-label="Next step" onClick={onNext} disabled={index >= route.steps.length - 1} className="w-8 h-8 rounded-lg bg-white/15 disabled:opacity-30 flex items-center justify-center rotate-180"><ArrowUp className="w-4 h-4" /></button>
        </div>
      </div>
      {next && (
        <div className="bg-blue-900 text-blue-50 text-sm px-4 py-2 flex items-center gap-2">
          <span className="opacity-70">Then</span> <ManeuverIcon step={next} className="w-4 h-4" /> <span className="truncate">{cleanInstruction(next.instruction)}</span>
        </div>
      )}
    </div>
  );
}

export function NavFooter({ route, walked, playing, onPlayPause, onRestart, onEnd, voice, onVoice }: {
  route: NavigationRoute; walked: number; playing: boolean; onPlayPause: () => void; onRestart: () => void; onEnd: () => void; voice: boolean; onVoice: () => void;
}) {
  const left = Math.max(0, route.totalDistanceMeters - walked);
  const mins = Math.max(left > 0 ? 1 : 0, Math.round((route.estimatedWalkTimeMinutes * left) / Math.max(1, route.totalDistanceMeters)));
  const done = left <= 0.01;
  return (
    <div data-ui className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xl font-extrabold text-slate-900 leading-none">{done ? 'Arrived' : `${mins} min`}</p>
        <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5 min-w-0"><Footprints className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{Math.round(left)} m left · {route.toName}</span></p>
      </div>
      <button aria-label={voice ? 'Mute voice' : 'Voice on'} onClick={onVoice} className="w-11 h-11 rounded-full ring-1 ring-slate-200 flex items-center justify-center text-slate-700">
        {voice ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
      </button>
      <button aria-label={playing ? 'Pause walk' : 'Play walk'} onClick={done ? onRestart : onPlayPause} className="w-11 h-11 rounded-full ring-1 ring-slate-200 flex items-center justify-center text-slate-700">
        {done ? <RotateCcw className="w-5 h-5" /> : playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
      </button>
      <button onClick={onEnd} className="h-11 px-5 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold">End</button>
    </div>
  );
}

export { Clock };
