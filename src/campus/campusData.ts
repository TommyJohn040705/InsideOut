/**
 * Campus-wide building database. Built by scripts/campus/buildCampusData.mjs from
 * OpenStreetMap footprints and the Plant Operations floor-plan manifest.
 * Indoor datasets are registered in INDOOR; adding a building means adding an entry
 * there (its georeference file and the app building id of its floor plans).
 */
import buildingsJson from '../data/campus/buildings.json';
import footprintsJson from '../data/campus/footprints.json';
import entrancesJson from '../data/campus/entrances.json';
import e5GeorefJson from '../data/campus/georef/E5.json';
import indoorOsmJson from '../data/campus/indoorOsm.json';
import { fitGeoref, Georef, GeorefSource, LngLat } from './georef';

export type FloorStatus =
  | 'not_sourced' | 'source_found' | 'import_authorized' | 'imported' | 'geometry_extracted'
  | 'georeferenced' | 'human_reviewed' | 'routing_available' | 'route_verified';

export const FLOOR_STATUS_LABEL: Record<FloorStatus, string> = {
  not_sourced: 'Not sourced',
  source_found: 'Source found',
  import_authorized: 'Import authorized',
  imported: 'Imported',
  geometry_extracted: 'Geometry extracted',
  georeferenced: 'Georeferenced (draft)',
  human_reviewed: 'Human-reviewed',
  routing_available: 'Routing available',
  route_verified: 'Physically route-verified',
};

export interface CampusFloor {
  id: string;
  floorCode: string;
  filename: string;
  url: string;
  restricted: boolean;
  /** How the source PDF can be obtained. */
  access: 'uw_login_required';
  status: FloorStatus;
  /** Floor number in the app's indoor dataset, when this floor has one. */
  indoorFloor?: number;
  /** Separately drawn wing of this building (Ron Eydt Village: CC, EH, NH, SH, WH). */
  wing?: string;
  /** Drawing set that covers several buildings (Village 1: V1_E123 covers East 1-3). */
  drawingSet?: string;
  sharedWith?: string[];
}

export type GapKind = 'off_main_campus' | 'not_uw' | 'affiliated_college' | 'rt_park_tenant' | 'residence_no_plans' | 'minor_structure' | 'unidentified' | 'plans_missing' | 'no_footprint';
export const GAP_LABEL: Record<GapKind, string> = {
  plans_missing: 'UW building, no plans listed',
  no_footprint: 'Plans listed, not on the map',
  residence_no_plans: 'Residence, no plans listed',
  affiliated_college: 'Affiliated college',
  rt_park_tenant: 'Not a UW building',
  not_uw: 'Not a UW building',
  minor_structure: 'Minor structure',
  unidentified: 'Unidentified in OSM',
  off_main_campus: 'Off the main campus',
};

export interface CampusBuilding {
  id: string;
  code: string | null;
  codeSource: string | null;
  name: string | null;
  osmIds: string[];
  levels: number | null;
  footprint: { source: string; license: string; fetchedAt: string; validation: string } | null;
  center: LngLat | null;
  entrances: string[];
  floors: CampusFloor[];
  plantOpsNumber: string | null;
  /** Why this building has no plans or no map position (built by scripts/campus/buildCampusData.mjs). */
  gap?: { kind: GapKind; note: string };
  /** Levels with rooms or corridors surveyed in OpenStreetMap (counts only; geometry is in indoorOsm.json). */
  osmIndoor: { level: string; label: string | null; rooms: number; paths: number }[];
}

export interface CampusEntrance {
  id: string;
  buildingId: string | null;
  position: LngLat;
  kind: string;
  name: string | null;
  level: string | null;
  wheelchair: string;
  source: string;
  validation: string;
}

export interface IndoorDataset {
  /** buildingId used by FloorPlanData in the indoor app. */
  appBuildingId: string;
  georef: Georef;
  /** Indoor routing graph exists (traced from drawings, not walked). */
  hasRouting: boolean;
}

export const INDOOR: Record<string, IndoorDataset> = {
  E5: { appBuildingId: 'uwaterloo-e5', georef: fitGeoref(e5GeorefJson as unknown as GeorefSource), hasRouting: true },
};

export const georefFor = (buildingId: string, floor: number): Georef | null => {
  const d = INDOOR[buildingId];
  return d && d.georef.source.floors.includes(floor) ? d.georef : null;
};

export const BUILDINGS: CampusBuilding[] = (buildingsJson as unknown as CampusBuilding[]).map((b) => {
  const indoor = INDOOR[b.id];
  if (!indoor) return b;
  return {
    ...b,
    floors: b.floors.map((f) => {
      const n = Number(f.floorCode);
      return indoor.georef.source.floors.includes(n) ? { ...f, status: 'georeferenced' as FloorStatus, indoorFloor: n } : f;
    }),
  };
});

export const FOOTPRINTS = footprintsJson as unknown as GeoJSON.FeatureCollection;
export const ENTRANCES = entrancesJson as unknown as CampusEntrance[];
export const CAMPUS_CENTER: LngLat = [-80.5437, 43.4712];

const byId = new Map(BUILDINGS.map((b) => [b.id, b]));
export const buildingById = (id: string) => byId.get(id) || null;
export const entrancesOf = (id: string) => ENTRANCES.filter((e) => e.buildingId === id);
export const buildingLabel = (b: CampusBuilding) => (b.code && b.name ? `${b.name} (${b.code})` : b.name || b.code || b.id);

export function searchBuildings(q: string, limit = 8): CampusBuilding[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const score = (b: CampusBuilding) => {
    const code = (b.code || '').toLowerCase(), name = (b.name || '').toLowerCase();
    if (code === s) return 0;
    if (code.startsWith(s)) return 1;
    if (name.startsWith(s)) return 2;
    if (name.includes(s) || code.includes(s)) return 3;
    return -1;
  };
  return BUILDINGS.map((b) => [score(b), b] as const).filter(([n]) => n >= 0).sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, b]) => b);
}

export type BuildingCoverage = 'indoor_draft' | 'indoor_osm' | 'floor_plans_listed' | 'outdoor_only' | 'no_footprint';
export function coverageOf(b: CampusBuilding): BuildingCoverage {
  if (INDOOR[b.id]) return 'indoor_draft';
  if (b.osmIndoor.some((l) => l.rooms > 0)) return 'indoor_osm';
  if (!b.footprint) return 'no_footprint';
  return b.floors.length ? 'floor_plans_listed' : 'outdoor_only';
}
export const COVERAGE_LABEL: Record<BuildingCoverage, string> = {
  indoor_draft: 'Indoor map (draft alignment)',
  indoor_osm: 'Rooms from OpenStreetMap (unreviewed, no routing)',
  floor_plans_listed: 'Floor plans listed, not yet mapped',
  outdoor_only: 'Outdoor only, no floor plans found',
  no_footprint: 'Floor plans listed, no map footprint',
};

export function coverageSummary() {
  // Village 1 drawing sets are attached to every house they cover; count each document once.
  const floors = [...new Map(BUILDINGS.flatMap((b) => b.floors).map((f) => [f.filename, f])).values()];
  const gaps: Partial<Record<GapKind, number>> = {};
  for (const b of BUILDINGS) if (b.gap) gaps[b.gap.kind] = (gaps[b.gap.kind] || 0) + 1;
  return {
    buildings: BUILDINGS.length,
    withFootprint: BUILDINGS.filter((b) => b.footprint).length,
    withFloorRefs: BUILDINGS.filter((b) => b.floors.length).length,
    indoorMapped: BUILDINGS.filter((b) => INDOOR[b.id]).length,
    floorRefs: floors.length,
    restrictedFloors: floors.filter((f) => f.restricted).length,
    georeferencedFloors: floors.filter((f) => f.status === 'georeferenced').length,
    entrances: ENTRANCES.length,
    gaps,
  };
}

/* ---- Indoor rooms and corridors surveyed in OpenStreetMap ---------------------------- */
interface OsmLevel {
  level: string;
  label: string | null;
  rooms: { id: string; ref: string | null; name: string | null; kind: string; wheelchair: string | null; ring: LngLat[] }[];
  paths: { id: string; kind: string; name: string | null; coords: LngLat[] }[];
  elevators: LngLat[];
}
const OSM_INDOOR = indoorOsmJson as unknown as Record<string, Record<string, OsmLevel>>;

/** "Floor 1" when OSM records the building's own floor label, otherwise the raw OSM level. */
export const osmLevelName = (l: { level: string; label: string | null }) => (l.label ? `Floor ${l.label}` : `OSM level ${l.level}`);

export function osmIndoorGeoJSON(buildingId: string, level: string): GeoJSON.FeatureCollection | null {
  const l = OSM_INDOOR[buildingId]?.[level];
  if (!l) return null;
  return { type: 'FeatureCollection', features: [
    ...l.rooms.map((r): GeoJSON.Feature => ({ type: 'Feature', properties: { layer: 'room', kind: r.kind, label: r.ref || r.name || '' }, geometry: { type: 'Polygon', coordinates: [r.ring] } })),
    ...l.paths.map((p): GeoJSON.Feature => ({ type: 'Feature', properties: { layer: 'path', kind: p.kind, label: p.name || '' }, geometry: { type: 'LineString', coordinates: p.coords } })),
    ...l.elevators.map((e): GeoJSON.Feature => ({ type: 'Feature', properties: { layer: 'elevator', kind: 'elevator', label: '' }, geometry: { type: 'Point', coordinates: e } })),
  ] };
}

export interface OsmRoomHit { building: CampusBuilding; level: string; levelName: string; ref: string | null; name: string | null; center: LngLat }
/** Rooms that carry a room number or name in OpenStreetMap, matched like "DC 1301" or "fishbowl". */
export function searchOsmRooms(q: string, limit = 6): OsmRoomHit[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const m = s.match(/^([a-z]+\d*)\s+(\S+)$/);
  const out: OsmRoomHit[] = [];
  for (const [id, levels] of Object.entries(OSM_INDOOR)) {
    const building = byId.get(id);
    if (!building) continue;
    if (m && m[1] !== (building.code || '').toLowerCase()) continue;
    const want = m ? m[2] : s;
    for (const l of Object.values(levels)) for (const r of l.rooms) {
      const ref = (r.ref || '').toLowerCase(), name = (r.name || '').toLowerCase();
      if (!(ref && ref.startsWith(want)) && !(name && name.includes(want))) continue;
      const cx = r.ring.reduce((a, p) => a + p[0], 0) / r.ring.length, cy = r.ring.reduce((a, p) => a + p[1], 0) / r.ring.length;
      out.push({ building, level: l.level, levelName: osmLevelName(l), ref: r.ref, name: r.name, center: [cx, cy] });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
