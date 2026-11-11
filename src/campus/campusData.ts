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
  status: FloorStatus;
  /** Floor number in the app's indoor dataset, when this floor has one. */
  indoorFloor?: number;
}

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

export type BuildingCoverage = 'indoor_draft' | 'floor_plans_listed' | 'outdoor_only' | 'no_footprint';
export function coverageOf(b: CampusBuilding): BuildingCoverage {
  if (INDOOR[b.id]) return 'indoor_draft';
  if (!b.footprint) return 'no_footprint';
  return b.floors.length ? 'floor_plans_listed' : 'outdoor_only';
}
export const COVERAGE_LABEL: Record<BuildingCoverage, string> = {
  indoor_draft: 'Indoor map (draft alignment)',
  floor_plans_listed: 'Floor plans listed, not yet mapped',
  outdoor_only: 'Outdoor only, no floor plans found',
  no_footprint: 'Floor plans listed, no map footprint',
};

export function coverageSummary() {
  const floors = BUILDINGS.flatMap((b) => b.floors);
  return {
    buildings: BUILDINGS.length,
    withFootprint: BUILDINGS.filter((b) => b.footprint).length,
    withFloorRefs: BUILDINGS.filter((b) => b.floors.length).length,
    indoorMapped: BUILDINGS.filter((b) => INDOOR[b.id]).length,
    floorRefs: floors.length,
    restrictedFloors: floors.filter((f) => f.restricted).length,
    georeferencedFloors: floors.filter((f) => f.status === 'georeferenced').length,
    entrances: ENTRANCES.length,
  };
}
