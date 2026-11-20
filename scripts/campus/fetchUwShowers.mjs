/**
 * Adds UW's showers and change rooms (public campus GIS layer "Campus_Showers_and_Changeroom_Map",
 * the one behind uwaterloo.ca/map) to src/data/campus/evidenceDestinations.json as searchable
 * room-level destinations. Re-running replaces the previous import. Usage:
 *   node scripts/campus/fetchUwShowers.mjs
 */
import fs from 'fs';

const SERVICE = 'https://services5.arcgis.com/z87D0RdgTttiUQbV/arcgis/rest/services/Campus_Showers_and_Changeroom_Map/FeatureServer/0';
const FILE = 'src/data/campus/evidenceDestinations.json';
const today = new Date().toISOString().slice(0, 10);

const r = await fetch(`${SERVICE}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`);
if (!r.ok) throw new Error(`UW GIS ${r.status}`);
const feats = (await r.json()).features || [];

const out = [];
for (const { attributes: a } of feats) {
  // "EC5 1902A", "BMH (LHI) 1665": building code, optional wing in brackets, room.
  const m = String(a.RM_NM || '').match(/^([A-Z][A-Z0-9_]*)\s*(?:\([^)]*\)\s*)?([A-Z]?\d{3,4}[A-Z]?)$/);
  if (!m) { console.warn('skipped (no building + room):', a.RM_NM); continue; }
  const [, code, room] = m;
  const what = [a.has_showers ? 'showers' : null, a.has_changeroom ? 'change room' : null].filter(Boolean).join(' and ') || a.USE_TYPE;
  out.push({
    id: `uw-showers-${code.toLowerCase()}-${room.toLowerCase()}`,
    campus: 'uwaterloo-main', building_code: code, room_number: room,
    floor: /^\d/.test(room) ? Number(room[0]) : null,
    display_name: `${a.USE_TYPE || 'Shower'}: ${what}${a.gender_access ? ` (${a.gender_access})` : ''}`,
    kind: 'shower_changeroom', person: null, person_role: null,
    access_tier: a.access_scope === 'Open' ? 'gender_or_accessibility_check' : 'permission_required',
    operational_status: 'listed', accessible: 'unknown', geometry_status: 'not_verified', routing_status: 'search_only',
    historical_2025: 'not_verified_for_2025', review_required: false,
    source_id: 'uw_showers', source_title: 'UW campus map: showers and change rooms', source_url: 'https://uwaterloo.ca/map/',
    source_checked_on: today,
    notes: [a.access_explain, a.access_method, a.lockers ? 'Lockers.' : null, a.general_comments].filter(Boolean).join(' ').trim() || 'Listed on the UW campus map.',
  });
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const before = data.records.length;
data.records = [...data.records.filter((x) => x.source_id !== 'uw_showers'), ...out];
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`${out.length} showers/change rooms from UW GIS; records ${before} -> ${data.records.length}`);
