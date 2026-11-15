/**
 * Builds src/data/campus/evidenceDestinations.json from the "InsideOut all-in-one" handoff
 * Markdown (section 2 source list + section 3 destination table). The handoff's companion
 * JSON files were never delivered, so the table is the source of truth here.
 *
 *   node scripts/campus/importEvidenceHandoff.mjs "C:\Users\...\InsideOut_CLAUDE_ALL_IN_ONE.md"
 *
 * Every record is a search-only destination: geometry_status "not_verified", no coordinates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mdPath = process.argv[2];
if (!mdPath) { console.error('Usage: node importEvidenceHandoff.mjs <handoff.md>'); process.exit(1); }
const md = fs.readFileSync(mdPath, 'utf8');
const CHECKED = '2026-11-14';

// Section 2: "1. **Title** — https://..." numbered sources.
const urls = {};
for (const m of md.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*\s+—\s+(https?:\/\/\S+)/gm)) urls[m[1]] = { title: m[2], url: m[3] };
const SOURCE_NO = {
  food: 8, eshops: 14, rpc: 15, eng_shared: 16, qnc: 17, mathlabs: 18, mathfaculty: 19, healthstaff: 20, civilstaff: 21,
  climate_juan: 22, climate_simron: 23, climate_neil: 24, washrooms: 12, prayer: 13, v1: 25, cmh: 26, housingdesks: 28, library: 7,
};

// Section 3 table rows.
const sec3 = md.slice(md.indexOf('## 3.'), md.indexOf('## 4.'));
const rows = [...sec3.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([a-z_]+)\s*\|\s*([^|]+?)\s*\|\s*`([a-z0-9_]+)`\s*\|$/gm)];

// Door or keypad codes must never reach the index (handoff section 4).
const CODE_RE = /\b(door|access|keypad|lock)\s*code\b|\bcode\s*[:#]?\s*\d{3,}/i;

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
export function floorOf(room) {
  if (!room) return null;
  const r = room.trim();
  if (/^B\d/i.test(r)) return -1; // basement (QNC B703 etc.)
  const d = r.match(/^(\d)/);
  return d ? Number(d[1]) : null;
}

const NOTES = {
  washroom: 'Listed as a menstrual equity washroom. Wheelchair accessibility is not established by this listing.',
  multi_faith: 'Availability varies. Door or keypad codes are deliberately not stored or shown; see the source page.',
  professional_office: 'Public professional office listing; staff move. Visit during posted hours or via the department reception.',
  residence_common_area: 'Residence shared or service space; residents only beyond the front desk. No private rooms are listed.',
  food_service: 'Hours change each term; check the Food Services page before going.',
};
const CONFLICTS = {
  'E3|2313': 'review_required: another Plant Operations menstrual equity listing gives E3 2143 for this washroom. Recheck which is current.',
  'SLC|3252/3254': 'review_required: an older multi-faith listing gives SLC 3109; the current Equity page gives 3252/3254. Verify before routing.',
};

const out = [];
const bad = [];
for (const [, where, title, kind, access0, sid] of rows) {
  const src = urls[SOURCE_NO[sid]];
  if (!src) { bad.push(`no source URL for ${sid}`); continue; }
  const [building_code, ...rest] = where.split(/\s+/);
  const room_number = rest.join(' ') || null;
  const closed = /\*\*CLOSED\*\*/.test(access0);
  const access_tier = access0.replace(/\s*\/\s*\*\*CLOSED\*\*/, '').trim();
  let person = null, person_role = null;
  if (kind === 'professional_office') {
    const p = title.split(/\s+—\s+/);
    if (p.length === 2) [person, person_role] = p;
  }
  const notes = [
    closed ? 'Listed CLOSED for M4 construction on the 2026 Food Services page. Do not offer as open.' : null,
    NOTES[kind] || null,
    CONFLICTS[`${building_code}|${room_number}`] || null,
  ].filter(Boolean).join(' ');
  const rec = {
    id: `${sid}-${slug(building_code)}-${room_number ? slug(room_number) : slug(title)}${kind === 'professional_office' && person ? '-' + slug(person) : ''}`,
    campus: 'uwaterloo-main',
    building_code, room_number, floor: floorOf(room_number),
    display_name: title, kind, person, person_role,
    access_tier, operational_status: closed ? 'closed' : 'listed',
    accessible: 'unknown',
    geometry_status: 'not_verified', routing_status: 'search_only', historical_2025: 'not_verified_for_2025',
    review_required: Boolean(CONFLICTS[`${building_code}|${room_number}`]),
    source_id: sid, source_title: src.title, source_url: src.url, source_checked_on: CHECKED,
    notes,
  };
  if (CODE_RE.test(JSON.stringify(rec))) { bad.push(`possible access code in ${rec.id}`); continue; }
  out.push(rec);
}

const nrb = urls[29];
out.push({
  id: 'housing-new-residence-building', campus: 'uwaterloo-main', building_code: 'NRB', room_number: null, floor: null,
  display_name: 'New Residence Building', kind: 'residence_common_area', person: null, person_role: null,
  access_tier: 'residence_shared_or_service', operational_status: 'planned', accessible: 'unknown',
  geometry_status: 'not_verified', routing_status: 'search_only', historical_2025: 'not_verified_for_2025', review_required: false,
  source_id: 'housing_nrb', source_title: nrb.title, source_url: nrb.url, source_checked_on: CHECKED,
  notes: 'Planned: Campus Housing states it opens in 2027. Not open in 2026; no entrances to route to.',
});

const ids = new Set();
for (const r of out) { if (ids.has(r.id)) bad.push(`duplicate id ${r.id}`); ids.add(r.id); }
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '../../src/data/campus/evidenceDestinations.json');
fs.writeFileSync(dest, JSON.stringify({ generatedFrom: path.basename(mdPath), checkedOn: CHECKED, records: out }, null, 2) + '\n');
const byKind = {};
for (const r of out) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log(`${rows.length} table rows -> ${out.length} records`, byKind);
