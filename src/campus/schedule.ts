/**
 * "My classes": read a timetable pasted from Quest (My Class Schedule, list view) or an .ics
 * calendar file, and find the next class. Kept on this device only (localStorage).
 */
export interface ClassMeeting {
  course: string;        // "CS 135 LEC 001"
  days: number[];        // 0 = Sunday … 6 = Saturday
  start: number; end: number; // minutes after midnight
  room: string;          // "MC 2065" (building code + room), as written in the timetable
  from?: string; until?: string; // YYYY-MM-DD, inclusive
}

const DAY: Record<string, number> = { Su: 0, Mo: 1, M: 1, Tu: 2, T: 2, We: 3, W: 3, Th: 4, Fr: 5, F: 5, Sa: 6 };
const ICS_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const mins = (t: string) => { const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i)!; let h = +m[1] % (m[3] ? 12 : 24); if (m[3]?.toUpperCase() === 'PM') h += 12; return h * 60 + +m[2]; };
const isoDate = (y: string, mo: string, d: string) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;

/** Quest list view: course headings ("CS 135 - Designing…") followed by rows "MWF 10:30AM - 11:20AM  MC 2065 … 2026/09/08 - 2026/12/05". */
function parseQuest(text: string): ClassMeeting[] {
  const out: ClassMeeting[] = [];
  let course = '', component = '';
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^\s*([A-Z]{2,6}\s?\d{3}[A-Z]?)\s+-\s+/);
    if (head) { course = head[1].replace(/^([A-Z]+)(\d)/, '$1 $2'); continue; }
    const comp = line.match(/\b(LEC|TUT|LAB|SEM|TST|PRJ|DIS)\b/);
    if (comp) component = comp[1];
    const row = line.match(/\b((?:Mo|Tu|We|Th|Fr|Sa|Su|M|T|W|F)+)\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s+([A-Z]{1,4}\d?)\s+([A-Z]?\d{3,4}[A-Z]?)\b/);
    if (!row || !course) continue;
    const dates = line.match(/(\d{4})\/(\d{2})\/(\d{2})\s*-\s*(\d{4})\/(\d{2})\/(\d{2})/);
    out.push({
      course: `${course}${component ? ' ' + component : ''}`,
      days: row[1].match(/Mo|Tu|We|Th|Fr|Sa|Su|M|T|W|F/g)!.map((d) => DAY[d]),
      start: mins(row[2]), end: mins(row[3]), room: `${row[4]} ${row[5]}`,
      ...(dates ? { from: isoDate(dates[1], dates[2], dates[3]), until: isoDate(dates[4], dates[5], dates[6]) } : {}),
    });
  }
  return out;
}

/** .ics: each VEVENT with a LOCATION; weekly RRULE BYDAY, or a one-off on its own date. Times are read as campus local time. */
function parseIcs(text: string): ClassMeeting[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: ClassMeeting[] = [];
  let ev: Record<string, string> | null = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') ev = {};
    else if (l === 'END:VEVENT' && ev) {
      const s = ev.DTSTART?.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/), e = ev.DTEND?.match(/T(\d{2})(\d{2})/);
      const room = ev.LOCATION?.replace(/\\,/g, ',').match(/\b([A-Z]{1,4}\d?)\s+([A-Z]?\d{3,4}[A-Z]?)\b/);
      if (s && e && room) {
        const date = isoDate(s[1], s[2], s[3]);
        const byday = ev.RRULE?.match(/BYDAY=([A-Z,]+)/)?.[1];
        const until = ev.RRULE?.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
        out.push({
          course: (ev.SUMMARY || 'Class').replace(/\\,/g, ','),
          days: byday ? byday.split(',').map((d) => ICS_DAY[d.slice(-2)]) : [new Date(+s[1], +s[2] - 1, +s[3]).getDay()],
          start: +s[4] * 60 + +s[5], end: +e[1] * 60 + +e[2], room: `${room[1]} ${room[2]}`,
          from: date, until: until ? isoDate(until[1], until[2], until[3]) : ev.RRULE ? undefined : date,
        });
      }
      ev = null;
    } else if (ev) { const i = l.indexOf(':'); if (i > 0) ev[l.slice(0, i).split(';')[0]] = l.slice(i + 1); }
  }
  return out;
}

export const parseSchedule = (text: string): ClassMeeting[] => (/BEGIN:VCALENDAR/.test(text) ? parseIcs(text) : parseQuest(text));

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The class happening now (until it ends) or next, within the coming week. */
export function nextClass(ms: ClassMeeting[], now: Date): { m: ClassMeeting; at: Date; now: boolean } | null {
  let best: { m: ClassMeeting; at: Date; now: boolean } | null = null;
  for (let i = 0; i < 8; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const k = dayKey(day), nowMin = i === 0 ? now.getHours() * 60 + now.getMinutes() : -1;
    for (const m of ms) {
      if (!m.days.includes(day.getDay()) || (m.from && k < m.from) || (m.until && k > m.until) || m.end <= nowMin) continue;
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m.start / 60), m.start % 60);
      if (!best || at < best.at) best = { m, at, now: m.start <= nowMin };
    }
    if (best) return best;
  }
  return null;
}

const KEY = 'insideout.myClasses';
export function loadClasses(): ClassMeeting[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveClasses(ms: ClassMeeting[]) { try { localStorage.setItem(KEY, JSON.stringify(ms)); } catch { /* private mode: kept for this visit only */ } }
export const timeLabel = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
