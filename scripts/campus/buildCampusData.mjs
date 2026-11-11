// Builds the campus-wide building database from two sources:
//   - OpenStreetMap footprints + entrances (data-sources/osm/uw-campus-osm.json, ODbL)
//   - Wayfinder's Plant Operations floor-plan manifest (data-sources/wayfinder/uw_floor_plans_manifest.json)
// Nothing is invented here: a building with no OSM footprint gets footprint: null,
// and a manifest row only ever becomes a floor with status "source_found".
// Run: node scripts/campus/buildCampusData.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// PDFs a UW account holder saved by hand go here (gitignored). A file present => status "imported".
const PDF_DIR = 'data-sources/plantops/pdfs';

const osm = JSON.parse(readFileSync('data-sources/osm/uw-campus-osm.json', 'utf8'));
const manifest = JSON.parse(readFileSync('data-sources/wayfinder/uw_floor_plans_manifest.json', 'utf8'));

// OSM names that have no `ref` tag but match a Plant Operations building code.
// Each alias is a name match only; it is recorded as codeSource: "name_alias".
const NAME_ALIASES = {
  'Mathematics 3': 'M3',
  'School of Pharmacy': 'PHR',
  'Claudette Millar Hall': 'CMH',
  'Toby Jenkins Applied Health Research Building': 'TJB',
  'Research Advancement Centre': 'RAC',
  'Research Advancement Centre 2': 'RA2',
  'Pearl Sullivan Engineering Building': 'E7',
  'Columbia Lake Village Community Centre': 'CLV_COMM_CTR',
  'Beck Hall': 'UWP_BECK',
  'Eby Hall': 'UWP_EBY',
  'Wilmot Court': 'UWP_WILMOT',
  'Wellesley Court': 'UWP_WELLESLEY',
  'Waterloo Court': 'UWP_WATERLOO',
  'Woolwich Court': 'UWP_WOOLWICH',
  'UW Place Grand Commons': 'UWP_COMMONS',
  'Student Village 1 Central Complex': 'V1_CC',
};
// OSM refs that differ from the Plant Operations code.
const REF_ALIASES = { PSE: 'E7', UWP: 'UWP_COMMONS', V1: 'V1_CC' };

const close = (ring) => {
  const a = ring[0], b = ring[ring.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, a];
};
const toRing = (geom) => geom.map((p) => [p.lon, p.lat]);

function polygonsOf(el) {
  if (el.type === 'way') return el.geometry?.length >= 4 ? [[close(toRing(el.geometry))]] : [];
  // relation: stitch outer members end to end; inner rings (courtyards) are dropped.
  // shortcut: no hole support, add inner rings if a courtyard building needs them.
  const outers = (el.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => toRing(m.geometry));
  const rings = [];
  let cur = null;
  for (const seg of outers) {
    if (!cur) cur = [...seg];
    else {
      const end = cur[cur.length - 1];
      const same = (p, q) => p[0] === q[0] && p[1] === q[1];
      if (same(end, seg[0])) cur.push(...seg.slice(1));
      else if (same(end, seg[seg.length - 1])) cur.push(...seg.reverse().slice(1));
      else { rings.push(cur); cur = [...seg]; }
    }
    if (cur.length > 3 && cur[0][0] === cur[cur.length - 1][0] && cur[0][1] === cur[cur.length - 1][1]) { rings.push(cur); cur = null; }
  }
  if (cur) rings.push(cur);
  return rings.filter((r) => r.length >= 4).map((r) => [close(r)]);
}

const centroid = (polys) => {
  let x = 0, y = 0, n = 0;
  for (const poly of polys) for (const p of poly[0]) { x += p[0]; y += p[1]; n++; }
  return [+(x / n).toFixed(7), +(y / n).toFixed(7)];
};

// metres between a point and a ring (nearest segment), equirectangular at campus latitude
const MX = 111320 * Math.cos((43.472 * Math.PI) / 180), MY = 110574;
function distToRing(pt, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][0] - pt[0]) * MX, ay = (ring[i][1] - pt[1]) * MY;
    const bx = (ring[i + 1][0] - pt[0]) * MX, by = (ring[i + 1][1] - pt[1]) * MY;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// ---- footprints -----------------------------------------------------------
const features = [];
const buildings = new Map(); // key -> building record
const keyOf = (code, osmId) => code || `osm-${osmId}`;

for (const el of osm.elements) {
  if (!el.tags?.building) continue;
  const polys = polygonsOf(el);
  if (!polys.length) continue;
  const t = el.tags;
  let code = null, codeSource = null;
  if (t.ref) { code = REF_ALIASES[t.ref] || t.ref; codeSource = 'osm_ref'; }
  else if (NAME_ALIASES[t.name]) { code = NAME_ALIASES[t.name]; codeSource = 'name_alias'; }
  const key = keyOf(code, el.id);
  const b = buildings.get(key) || {
    id: key, code, codeSource, name: t.name || null, osmIds: [], levels: t['building:levels'] ? Number(t['building:levels']) : null,
    footprint: { source: 'OpenStreetMap', license: 'ODbL 1.0', fetchedAt: osm.fetchedAt, validation: 'unreviewed' },
    polys: [], entrances: [], floors: [], plantOpsNumber: null,
  };
  b.osmIds.push(`${el.type}/${el.id}`);
  b.polys.push(...polys);
  if (!b.name && t.name) b.name = t.name;
  buildings.set(key, b);
}

// ---- floor-plan manifest --------------------------------------------------
// Manifest codes come in two spellings ("053E5" and "E5"); strip the building number.
const normCode = (c) => c.replace(/^\d{3,}/, '');
for (const row of manifest) {
  const code = normCode(row.buildingCode);
  let b = buildings.get(code);
  if (!b) {
    b = { id: code, code, codeSource: 'plant_ops_manifest', name: null, osmIds: [], levels: null, footprint: null, polys: [], entrances: [], floors: [], plantOpsNumber: null };
    buildings.set(code, b);
  }
  if (/^\d+$/.test(row.buildingNumber) && row.buildingNumber !== '000') b.plantOpsNumber = row.buildingNumber;
  if (b.floors.some((f) => f.filename === row.filename)) continue;
  // The manifest's floorCode is wrong for roof plans; the filename suffix is authoritative.
  const floorCode = (row.filename.match(/_([A-Z0-9]+?)(?:FLR)?.pdf$/i) || [])[1] || row.floorCode;
  b.floors.push({
    id: row.filename.replace(/.pdf$/i, ''),
    floorCode,
    filename: row.filename,
    url: row.url,
    restricted: !!row.restricted,
    // Mapping status ladder: not_sourced < source_found < import_authorized < imported <
    // geometry_extracted < georeferenced < human_reviewed < routing_available < route_verified
    status: existsSync(`${PDF_DIR}/${row.filename}`) ? 'imported' : 'source_found',
    // Checked 2026-11-10: every plantops.uwaterloo.ca PDF URL redirects to UW single sign-on.
    access: 'uw_login_required',
  });
}

// ---- entrances (OSM nodes snapped to the building whose wall they sit on) ---
const entrances = [];
for (const el of osm.elements) {
  if (el.type !== 'node' || !el.tags?.entrance) continue;
  const pt = [el.lon, el.lat];
  let best = null, bestD = 3; // metres; an entrance node is normally a vertex of the wall
  for (const b of buildings.values()) for (const poly of b.polys) {
    const d = distToRing(pt, poly[0]);
    if (d < bestD) { bestD = d; best = b; }
  }
  const e = {
    id: `osm-node-${el.id}`, buildingId: best?.id || null, position: [el.lon, el.lat],
    kind: el.tags.entrance, name: el.tags.name || null, level: el.tags.level || null,
    wheelchair: el.tags.wheelchair || 'unknown', // OSM tag as mapped; not an accessibility audit
    source: 'OpenStreetMap', validation: 'unreviewed',
  };
  entrances.push(e);
  if (best) best.entrances.push(e.id);
}

// ---- indoor rooms and corridors surveyed in OpenStreetMap ---------------------
// These are already in real coordinates, so they need no georeferencing. They are community
// data: unreviewed, incomplete, and not a routing graph.
const indoorRaw = existsSync('data-sources/osm/uw-campus-indoor.json') ? JSON.parse(readFileSync('data-sources/osm/uw-campus-indoor.json', 'utf8')) : { elements: [] };
const inRing = (pt, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const buildingAt = (pt) => {
  let near = null, nearD = 30; // metres: bridges and tunnels sit just outside a footprint
  for (const b of buildings.values()) for (const poly of b.polys) {
    if (inRing(pt, poly[0])) return b;
    const d = distToRing(pt, poly[0]);
    if (d < nearD) { nearD = d; near = b; }
  }
  return near;
};
const indoor = {}; // buildingId -> { level -> { label, rooms, paths, elevators } }
let indoorDropped = 0;
const levelOf = (id, level, label) => {
  const lv = ((indoor[id] ||= {})[level] ||= { level, label: null, rooms: [], paths: [], elevators: [] });
  if (label && !lv.label) lv.label = label;
  return lv;
};
for (const el of indoorRaw.elements) {
  const t = el.tags || {};
  if (t.level == null || t.indoor === 'no' || t.indoor === 'wall' || t.highway === 'construction') continue;
  const levels = String(t.level).split(';').map((x) => x.trim()).filter(Boolean);
  const labels = t['level:ref'] ? String(t['level:ref']).split(';') : [];
  if (el.type === 'node') {
    if (t.highway !== 'elevator') continue;
    const b = buildingAt([el.lon, el.lat]);
    if (!b) { indoorDropped++; continue; }
    for (const lv of levels) levelOf(b.id, lv).elevators.push([el.lon, el.lat]);
    continue;
  }
  if (el.type !== 'way' || !el.geometry) continue;
  const coords = toRing(el.geometry);
  const mid = coords[Math.floor(coords.length / 2)];
  const closed = coords.length > 3 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
  const b = buildingAt(closed ? centroid([[coords]]) : mid);
  if (!b) { indoorDropped++; continue; }
  levels.forEach((lv, i) => {
    const L = levelOf(b.id, lv, levels.length === labels.length ? labels[i] : labels.length === 1 && levels.length === 1 ? labels[0] : null);
    if (closed && (t.indoor === 'room' || t.indoor === 'area' || t.indoor === 'corridor')) {
      L.rooms.push({ id: `osm-way-${el.id}`, ref: t.ref || null, name: t.name || null, kind: t.amenity || t.room || t.indoor, wheelchair: t.wheelchair || null, ring: coords });
    } else if (t.highway) {
      L.paths.push({ id: `osm-way-${el.id}`, kind: t.bridge ? 'bridge' : t.tunnel ? 'tunnel' : t.highway, name: t.name || null, coords });
    }
  });
}
for (const b of buildings.values()) {
  const lv = indoor[b.id];
  b.osmIndoor = lv ? Object.values(lv).sort((x, y) => Number(x.level) - Number(y.level)).map((l) => ({ level: l.level, label: l.label, rooms: l.rooms.length, paths: l.paths.length })) : [];
}

// ---- write ----------------------------------------------------------------
const out = [];
for (const b of buildings.values()) {
  b.floors.sort((x, y) => x.floorCode.localeCompare(y.floorCode));
  const { polys, ...rest } = b;
  if (polys.length) {
    rest.center = centroid(polys);
    features.push({
      type: 'Feature', id: b.id,
      properties: { id: b.id, code: b.code, name: b.name, label: b.code || b.name || '' },
      geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys },
    });
  } else rest.center = null;
  out.push(rest);
}
out.sort((a, b) => (a.code || a.name || a.id).localeCompare(b.code || b.name || b.id));

mkdirSync('src/data/campus', { recursive: true });
writeFileSync('src/data/campus/buildings.json', JSON.stringify(out));
writeFileSync('src/data/campus/footprints.json', JSON.stringify({ type: 'FeatureCollection', features }));
writeFileSync('src/data/campus/entrances.json', JSON.stringify(entrances));
writeFileSync('src/data/campus/indoorOsm.json', JSON.stringify(indoor));

const withBoth = out.filter((b) => b.footprint && b.floors.length);
console.log(`buildings ${out.length} | with footprint ${out.filter((b) => b.footprint).length} | with floor-plan refs ${out.filter((b) => b.floors.length).length} | both ${withBoth.length}`);
console.log(`floor refs ${out.reduce((n, b) => n + b.floors.length, 0)} (restricted ${out.reduce((n, b) => n + b.floors.filter((f) => f.restricted).length, 0)}) | entrances ${entrances.length} (matched to a building ${entrances.filter((e) => e.buildingId).length})`);
console.log('manifest codes with no footprint:', out.filter((b) => !b.footprint).map((b) => b.code).join(' '));
console.log('OSM indoor:', Object.entries(indoor).map(([id, lv]) => `${id}[${Object.values(lv).map((l) => `L${l.level}:${l.rooms.length}r/${l.paths.length}p`).join(' ')}]`).join('  '), '| dropped (no building within 30 m):', indoorDropped);
