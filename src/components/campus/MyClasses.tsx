import React, { useState } from 'react';
import { CalendarDays, Navigation2, X, Upload } from 'lucide-react';
import { ClassMeeting, nextClass, parseSchedule, saveClasses, timeLabel } from '../../campus/schedule';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The next class as one line with a Directions button (shown on the campus map). */
export function NextClassChip({ classes, onDirections }: { classes: ClassMeeting[]; onDirections: (room: string) => void }) {
  const n = nextClass(classes, new Date());
  if (!n) return null;
  const today = n.at.toDateString() === new Date().toDateString();
  return (
    <div className="flex items-center gap-2 bg-blue-50 ring-1 ring-blue-200 rounded-xl p-2.5">
      <CalendarDays className="w-5 h-5 text-blue-700 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-bold text-slate-900 truncate">{n.now ? 'Now' : 'Next'}: {n.m.course}</div>
        <div className="text-xs text-slate-600">{n.now ? `until ${timeLabel(n.m.end)}` : `${today ? 'Today' : DAYS[n.at.getDay()]} ${timeLabel(n.m.start)}`} · {n.m.room}</div>
      </div>
      <button onClick={() => onDirections(n.m.room)} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1 shrink-0"><Navigation2 className="w-3.5 h-3.5" /> Go</button>
    </div>
  );
}

export function MyClasses({ classes, onChange, onDirections, onClose }: { classes: ClassMeeting[]; onChange: (c: ClassMeeting[]) => void; onDirections: (room: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(!classes.length);

  const read = (t: string) => {
    const ms = parseSchedule(t);
    if (!ms.length) { setMsg('No classes found. Paste the List View of "My Class Schedule" from Quest (with days, times and rooms), or upload an .ics calendar.'); return; }
    saveClasses(ms); onChange(ms); setEditing(false); setText(''); setMsg(`Read ${ms.length} class meeting${ms.length > 1 ? 's' : ''}. Saved on this phone only.`);
  };
  const file = async (f: File | undefined) => { if (f) read(await f.text()); };

  return (
    <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-4 space-y-3 max-h-[60dvh] overflow-y-auto" role="region" aria-label="My classes">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-blue-600" /><div className="font-extrabold flex-1">My classes</div>
        <button aria-label="Close my classes" onClick={onClose} className="p-1 text-slate-500"><X className="w-5 h-5" /></button>
      </div>
      {msg && <p role="status" className="text-xs text-slate-700 bg-slate-50 rounded-lg p-2">{msg}</p>}
      {classes.length > 0 && !editing && (
        <>
          <NextClassChip classes={classes} onDirections={onDirections} />
          <ul className="divide-y divide-slate-100 text-sm">
            {classes.map((m, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{m.course}</div>
                  <div className="text-xs text-slate-500">{m.days.map((d) => DAYS[d]).join(' ')} {timeLabel(m.start)}–{timeLabel(m.end)} · {m.room}</div>
                </div>
                <button aria-label={`Directions to ${m.room}`} onClick={() => onDirections(m.room)} className="h-9 px-2.5 text-blue-700"><Navigation2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-3 text-xs font-semibold">
            <button onClick={() => setEditing(true)} className="text-blue-700">Replace timetable</button>
            <button onClick={() => { saveClasses([]); onChange([]); setEditing(true); setMsg('Timetable removed from this phone.'); }} className="text-slate-500">Remove</button>
          </div>
        </>
      )}
      {editing && (
        <>
          <p className="text-xs text-slate-600">In Quest open <b>Class Schedule → My Class Schedule → List View</b>, select all, copy, and paste it here. Or upload a calendar (.ics) file. It stays on this phone.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Paste your timetable" placeholder="Paste your Quest timetable here"
            className="w-full rounded-xl bg-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2">
            <button disabled={!text.trim()} onClick={() => read(text)} className="flex-1 h-10 rounded-xl bg-blue-600 disabled:bg-slate-300 text-white text-sm font-bold">Read timetable</button>
            <label className="h-10 px-3 rounded-xl ring-1 ring-slate-200 text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4" /> .ics
              <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => file(e.target.files?.[0])} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
