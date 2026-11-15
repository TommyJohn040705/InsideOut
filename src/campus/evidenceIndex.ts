/**
 * Source-backed campus destinations (src/data/campus/evidenceDestinations.json, built by
 * scripts/campus/importEvidenceHandoff.mjs). A record says "this official page lists this
 * name at this building/room on this date". It is NOT a door position, an accessibility
 * claim or a route: everything here is search-only until a reviewed floor plan places it.
 */
import evidenceJson from '../data/campus/evidenceDestinations.json';
import e5RoomsJson from '../data/e5/rooms.json';
import { buildingById, type CampusBuilding } from './campusData';

export interface EvidenceRecord {
  id: string; campus: string; building_code: string; room_number: string | null; floor: number | null;
  display_name: string; kind: string; person: string | null; person_role: string | null;
  access_tier: string; operational_status: 'listed' | 'closed' | 'planned';
  accessible: 'unknown';
  geometry_status: 'not_verified' | 'reviewed_floorplan' | 'walk_verified';
  routing_status: 'search_only' | 'routing_verified';
  historical_2025: 'not_verified_for_2025' | 'verified_2025';
  review_required: boolean;
  source_id: string; source_title: string; source_url: string; source_checked_on: string; notes: string;
}

export interface EvidenceHit {
  rec: EvidenceRecord;
  /** Existing campus building, or null when the code is not in buildings.json. */
  building: CampusBuilding | null;
  /** How the code was linked, when it is not a straight match. */
  linkNote: string | null;
  /** The traced E5 room with this number (E5 data is read, never changed). */
  e5Room: { id: string; name: string; nameConflict: boolean } | null;
  accessLabel: string;
  /** Set when the query asked about 2025 and only a current listing exists. */
  historicalNote: string | null;
}

/** Handoff codes that differ from buildings.json ids. EXP, MUS and NRB stay unlinked. */
const ALIASES: Record<string, { id: string; note: string }> = {
  V1: { id: 'V1_CC', note: 'V1 shown at the Village 1 Central Complex' },
  CLV: { id: 'CLV_COMM_CTR', note: 'CLV shown at the Columbia Lake Village Community Centre' },
  PSE: { id: 'E7', note: 'PSE taken as E7 (Pearl Sullivan Engineering) by building name; not confirmed by UW' },
};

export const ACCESS_LABEL: Record<string, string> = {
  public_or_service: 'Public or service space',
  service_access_check: 'Service space: check access and hours first',
  professional_office_lobby_only: 'Professional office: visit during posted hours',
  faculty_rules: 'Faculty access rules apply',
  course_or_faculty_rules: 'Course or faculty access rules apply',
  course_restricted: 'Course-restricted: enrolled students only',
  restricted_lab: 'Restricted lab: authorized, trained users only',
  staff_or_authorized: 'Research space: staff or authorized users only, no unsupervised public entry',
  permission_required: 'Permission or training required before use',
  residence_shared_or_service: 'Residence space: residents, visitors to the front desk only',
  booking_or_event: 'By booking or for events',
  availability_varies: 'Availability varies',
  gender_or_accessibility_check: 'Check the washroom type; wheelchair access unknown',
};

/** Extra words a person might type for each kind or source. */
const KIND_WORDS: Record<string, string> = {
  washroom: 'washroom washrooms bathroom restroom toilet menstrual',
  multi_faith: 'prayer multi faith multifaith quiet room chapel worship',
  food_service: 'food cafe coffee eat restaurant lunch',
  administrative_service: 'office administration',
  lab_or_facility: 'lab labs facility',
  professional_office: 'office professor faculty staff',
  residence_common_area: 'residence housing front desk',
  library_directory: 'library floor directory',
};
const SOURCE_WORDS: Record<string, string> = {
  mathlabs: 'mfcf math computing',
  eshops: 'sedra machine shop',
  rpc: 'rpc 3d printing',
  qnc: 'metrology microscopy',
  eng_shared: 'engineering shared research',
};
const STOP = new Set(['the', 'a', 'an', 'for', 'in', 'at', 'of', 'to', 'where', 'is', 'was', 'what', 's', 'and', 'my', 'nearest']);

export const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
export const normRoom = (r: string | null) => (r ? r.toUpperCase().replace(/\s+/g, ' ').trim() : null);

/** Duplicates are the same building + room + kind + name; the first one wins. */
export function dedupeEvidence(recs: EvidenceRecord[]): { records: EvidenceRecord[]; duplicates: EvidenceRecord[] } {
  const seen = new Set<string>();
  const records: EvidenceRecord[] = [];
  const duplicates: EvidenceRecord[] = [];
  for (const r of recs) {
    const k = [r.building_code.toUpperCase(), normRoom(r.room_number) || '', r.kind, words(r.display_name).join(' ')].join('|');
    if (seen.has(k)) duplicates.push(r); else { seen.add(k); records.push(r); }
  }
  return { records, duplicates };
}

const RAW = (evidenceJson as unknown as { records: EvidenceRecord[] }).records;
export const EVIDENCE = dedupeEvidence(RAW);

type E5Room = { id: string; roomNumber?: string; name: string };
const E5_BY_NUMBER = new Map((e5RoomsJson as E5Room[]).filter((r) => r.roomNumber).map((r) => [r.roomNumber!.toUpperCase(), r]));
const sharesWord = (a: string, b: string) => {
  const A = new Set(words(a).filter((w) => w.length >= 4 && w !== 'room'));
  return words(b).some((w) => A.has(w));
};

export function linkBuilding(code: string): { building: CampusBuilding | null; linkNote: string | null } {
  const a = ALIASES[code.toUpperCase()];
  if (a) return { building: buildingById(a.id), linkNote: a.note };
  const b = buildingById(code.toUpperCase());
  return { building: b, linkNote: b ? null : `${code} is not in the campus building list` };
}

function toHit(rec: EvidenceRecord, asked2025: boolean): EvidenceHit {
  const { building, linkNote } = linkBuilding(rec.building_code);
  const e5 = rec.building_code === 'E5' && rec.room_number ? E5_BY_NUMBER.get(rec.room_number.toUpperCase()) : undefined;
  return {
    rec, building, linkNote,
    e5Room: e5 ? { id: e5.id, name: e5.name, nameConflict: !sharesWord(e5.name, rec.display_name) } : null,
    accessLabel: ACCESS_LABEL[rec.access_tier] || 'Access not described',
    historicalNote: asked2025 && rec.historical_2025 !== 'verified_2025'
      ? `2025 ${rec.kind === 'professional_office' ? 'office' : 'location'} not verified: only a listing checked on ${rec.source_checked_on} exists.`
      : null,
  };
}

const INDEX = EVIDENCE.records.map((rec) => {
  const b = linkBuilding(rec.building_code).building;
  const place = new Set(words(`${rec.building_code} ${b?.code || ''} ${b?.name || ''}`));
  // The building code inside a name ("E5 multi-faith space") counts as place, not as what.
  const codes = new Set(words(`${rec.building_code} ${b?.code || ''}`));
  const what = new Set(words([rec.display_name, rec.person, rec.person_role, rec.room_number, KIND_WORDS[rec.kind], SOURCE_WORDS[rec.source_id]].filter(Boolean).join(' ')).filter((w) => !codes.has(w)));
  const room = normRoom(rec.room_number);
  return { rec, place, what, room, name: words(rec.display_name).join(' ') };
});

/**
 * Every query word must match (as a word prefix) the record's name, person, room, kind words or
 * building; at least one must match something other than the building, so "E5" alone stays a
 * building search. "2025" is taken as a question about history, not a word to match.
 */
export function searchEvidence(q: string, limit = 6): EvidenceHit[] {
  const all = words(q);
  const asked2025 = all.includes('2025');
  const toks = all.filter((w) => w !== '2025' && !STOP.has(w));
  if (!toks.length) return [];
  const has = (set: Set<string>, t: string) => { for (const w of set) if (w.startsWith(t)) return true; return false; };
  const scored: { s: number; i: (typeof INDEX)[number] }[] = [];
  for (const i of INDEX) {
    let s = 0, what = 0, ok = true;
    for (const t of toks) {
      const inWhat = has(i.what, t);
      if (inWhat) { what++; s += i.name.split(' ').includes(t) || i.room?.toLowerCase() === t ? 3 : 1; }
      else if (has(i.place, t)) s += i.place.has(t) ? 2 : 1;
      else { ok = false; break; }
    }
    // Closed or planned places sort after open ones unless named outright.
    if (ok && what) scored.push({ s: s + (i.name.includes(toks.join(' ')) ? 3 : 0) - (i.rec.operational_status === 'listed' ? 0 : 2), i });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map(({ i }) => toHit(i.rec, asked2025));
}

export const evidenceById = (id: string) => EVIDENCE.records.find((r) => r.id === id) || null;

/** Published listings for one room of a campus building (buildings.json id, e.g. "MC", "E7"). */
export function evidenceForRoom(buildingId: string, roomNumber?: string): EvidenceRecord[] {
  const n = normRoom(roomNumber || null);
  if (!n) return [];
  return EVIDENCE.records.filter((r) => (ALIASES[r.building_code]?.id || r.building_code) === buildingId && normRoom(r.room_number) === n);
}

/**
 * A drawing-only room with the name and purpose an official page lists for it, and that page as
 * the source. Rooms a person already described (staff report, approved lookup) are left as they are.
 */
export function withEvidence<T extends { roomNumber?: string; name: string; purpose?: string; purposeVerification?: string; sourceUrl?: string }>(room: T, buildingId: string): T {
  if (room.purposeVerification && room.purposeVerification !== 'unverified_drawing_only') return room;
  const recs = evidenceForRoom(buildingId, room.roomNumber);
  if (!recs.length) return room;
  const r = recs[0];
  const what = recs.map((x) => (x.person ? `${x.person}${x.person_role ? `, ${x.person_role}` : ''}` : x.display_name)).join('; ');
  return {
    ...room,
    name: r.person ? `${r.person}'s office` : r.display_name,
    purpose: `${r.operational_status === 'closed' ? 'Closed. ' : ''}${what}. ${ACCESS_LABEL[r.access_tier] || ''}. Listed on ${r.source_title}, checked ${r.source_checked_on}.`.replace(/\.\s*\./g, '.'),
    purposeVerification: 'verified_official_source',
    sourceUrl: r.source_url,
  };
}
