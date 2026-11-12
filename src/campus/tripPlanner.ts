/**
 * Room-to-room trips across campus: indoor route to a building door, outdoor walk on the
 * OpenStreetMap path network, indoor route from the destination door. The same code serves
 * every building; a building takes part indoors only when it has a georeferenced indoor
 * dataset (E5's traced drawings, or a published floor-plan import).
 */
import type { FloorPlanData, NavigationRoute, RoomPOI } from '../types/navigation';
import { calculateIndoorRoute } from '../utils/pathfinding';
import { distanceM, type Georef, type LngLat } from './georef';
import { INDOOR, buildingById, entrancesOf, georefFor, type CampusEntrance } from './campusData';
import { importAppBuildingId, georefOfImport, type FloorImport } from './floorImports';
import { routeOutdoor, type OutdoorGraph, type OutdoorRoute } from './outdoorRoute';

export interface IndoorSite {
  buildingId: string;
  /** buildingId of this site's floors in the indoor navigator. */
  appBuildingId: string;
  plans: FloorPlanData[];
  georef(floor: number): Georef | null;
  /** Where the alignment comes from, for the UI. */
  alignment: string;
}

export function indoorSites(plans: FloorPlanData[], imports: FloorImport[]): Record<string, IndoorSite> {
  const out: Record<string, IndoorSite> = {};
  for (const [id, d] of Object.entries(INDOOR)) {
    out[id] = { buildingId: id, appBuildingId: d.appBuildingId, plans: plans.filter((p) => p.buildingId === d.appBuildingId), georef: (f) => georefFor(id, f), alignment: `Draft fit to the OpenStreetMap footprint (${d.georef.rmsM.toFixed(1)} m fit error)` };
  }
  const byB = new Map<string, FloorImport[]>();
  for (const f of imports) if (f.published && georefOfImport(f)) byB.set(f.buildingId, [...(byB.get(f.buildingId) || []), f]);
  for (const [id, fl] of byB) {
    if (out[id]) continue; // a building's own traced dataset wins over an import
    out[id] = {
      buildingId: id,
      appBuildingId: importAppBuildingId(id),
      plans: plans.filter((p) => p.buildingId === importAppBuildingId(id)),
      georef: (n) => { const f = fl.find((x) => x.floorNumber === n); return f ? georefOfImport(f) : null; },
      alignment: `Control points set in the floor-plan studio${fl.every((f) => f.reviewed) ? ', reviewed' : ', not reviewed'}`,
    };
  }
  return out;
}

/** An indoor entrance room counts as behind a door only if it is this close (m). */
export const DOOR_LINK_M = 20;

export interface DoorLink { door: CampusEntrance; room: RoomPOI; m: number }

export function doorLinks(site: IndoorSite, buildingId: string): DoorLink[] {
  const rooms = site.plans.flatMap((p) => p.rooms.filter((r) => r.category === 'entrance').map((r) => ({ ...r, floor: r.floor ?? p.floorNumber })));
  const out: DoorLink[] = [];
  for (const door of entrancesOf(buildingId)) {
    let best: DoorLink | null = null;
    for (const r of rooms) {
      const g = site.georef(r.floor!);
      if (!g) continue;
      const m = distanceM(door.position, g.pctToLngLat(r.coords));
      if (m <= DOOR_LINK_M && (!best || m < best.m)) best = { door, room: r, m };
    }
    if (best) out.push(best);
  }
  return out;
}

export interface TripEnd {
  buildingId?: string;
  room?: RoomPOI;
  /** A known point (GPS fix, or an OpenStreetMap room centre in a building without routing). */
  at?: LngLat;
  label: string;
}

export type TripLeg =
  | { kind: 'indoor'; buildingId: string; route: NavigationRoute; door?: DoorLink }
  | { kind: 'outdoor'; route: OutdoorRoute; from: string; to: string };

export interface Trip {
  legs: TripLeg[];
  notes: string[];
  totalM: number;
  /** Everything drawable on the campus map, in order: indoor (door floors), outdoor, indoor. */
  line: LngLat[];
}

const roomFloorPlan = (site: IndoorSite, floor: number) => site.plans.find((p) => p.floorNumber === floor);

function indoor(site: IndoorSite, a: RoomPOI, b: RoomPOI, accessible: boolean): NavigationRoute | null {
  const pa = roomFloorPlan(site, a.floor!);
  if (!pa) return null;
  try {
    return calculateIndoorRoute(pa, a.coords, a.name, b.coords, b.name, a.id, b.id, { isAccessibleOnly: accessible, allFloors: site.plans, startFloor: a.floor!, endFloor: b.floor! });
  } catch { return null; }
}

const doorName = (d: CampusEntrance, b: string) => `${b} ${d.name || (d.kind === 'main' ? 'main entrance' : 'entrance')}`;

function candidateDoors(buildingId: string, accessible: boolean, toward: LngLat | null, notes: string[]): CampusEntrance[] {
  let doors = entrancesOf(buildingId);
  if (accessible) {
    const ok = doors.filter((d) => d.wheelchair !== 'no');
    const yes = ok.filter((d) => d.wheelchair === 'yes');
    if (!yes.length && ok.length) notes.push(`No ${buildingId} entrance is tagged wheelchair-accessible in OpenStreetMap; accessibility of the door used is unknown.`);
    doors = yes.length ? yes : ok;
  }
  if (toward) doors = [...doors].sort((x, y) => distanceM(x.position, toward) - distanceM(y.position, toward));
  return doors.slice(0, 4);
}

export function planTrip(g: OutdoorGraph, sites: Record<string, IndoorSite>, from: TripEnd, to: TripEnd, accessible: boolean): Trip | { error: string } {
  const notes: string[] = [];
  const fs = from.buildingId ? sites[from.buildingId] : undefined;
  const ts = to.buildingId ? sites[to.buildingId] : undefined;

  // Same building with an indoor map: indoor only.
  if (from.buildingId && from.buildingId === to.buildingId && fs && from.room && to.room) {
    const r = indoor(fs, from.room, to.room, accessible);
    if (!r) return { error: `No indoor route between those rooms in ${from.buildingId}.` };
    return { legs: [{ kind: 'indoor', buildingId: from.buildingId, route: r }], notes, totalM: r.totalDistanceMeters, line: [] };
  }

  const centre = (e: TripEnd) => e.at || (e.buildingId ? buildingById(e.buildingId)?.center || null : null);
  const fromDoors: (CampusEntrance | null)[] = from.buildingId ? candidateDoors(from.buildingId, accessible, from.at || centre(to), notes) : [null];
  const toDoors = to.buildingId ? candidateDoors(to.buildingId, accessible, centre(from), notes) : [];
  if (from.buildingId && !fromDoors.length) return { error: `No entrance of ${from.buildingId} is mapped, so no outdoor route can start there.` };
  if (!to.buildingId || !toDoors.length) return { error: `No entrance of ${to.buildingId || 'the destination'} is mapped.` };

  const fLinks = fs && from.room ? doorLinks(fs, from.buildingId!) : [];
  const tLinks = ts && to.room ? doorLinks(ts, to.buildingId!) : [];
  if (from.room && !fs) notes.push(`${from.buildingId} has no indoor routing map: walk from ${from.label} to the ${from.buildingId} exit yourself.`);
  if (to.room && !ts) notes.push(`${to.buildingId} has no indoor routing map: from the door, find ${to.label} yourself.`);

  let best: Trip | null = null;
  for (const fd of fromDoors) {
    const fl = fd ? fLinks.find((l) => l.door.id === fd.id) : undefined;
    if (fs && from.room && fd && !fl) continue; // this door has no known indoor side
    const inA = fl ? indoor(fs!, from.room!, fl.room, accessible) : null;
    if (fl && !inA) continue;
    for (const td of toDoors) {
      const tl = tLinks.find((l) => l.door.id === td.id);
      if (ts && to.room && !tl) continue;
      const inC = tl ? indoor(ts!, tl.room, to.room!, accessible) : null;
      if (tl && !inC) continue;
      const start = fd ? { id: fd.id, position: fd.position } : from.at ? { position: from.at } : null;
      if (!start) return { error: 'Choose where the trip starts.' };
      const out = routeOutdoor(g, start, { id: td.id, position: td.position }, accessible);
      if (!out) continue;
      const total = (inA?.totalDistanceMeters || 0) + out.distanceM + (inC?.totalDistanceMeters || 0) + (fl?.m || 0) + (tl?.m || 0);
      if (best && total >= best.totalM) continue;
      const legs: TripLeg[] = [];
      const line: LngLat[] = [];
      if (inA && fl) {
        legs.push({ kind: 'indoor', buildingId: from.buildingId!, route: inA, door: fl });
        const seg = inA.floorSegments.find((s) => s.floor === fl.room.floor);
        const gA = fs!.georef(fl.room.floor!);
        if (seg && gA) line.push(...seg.waypoints.map((p) => gA.pctToLngLat(p)));
      }
      line.push(...out.coords);
      legs.push({ kind: 'outdoor', route: out, from: fd ? doorName(fd, from.buildingId!) : from.label, to: doorName(td, to.buildingId!) });
      if (inC && tl) {
        legs.push({ kind: 'indoor', buildingId: to.buildingId!, route: inC, door: tl });
        const seg = inC.floorSegments.find((s) => s.floor === tl.room.floor);
        const gC = ts!.georef(tl.room.floor!);
        if (seg && gC) line.push(...seg.waypoints.map((p) => gC.pctToLngLat(p)));
      }
      best = { legs, notes: [], totalM: total, line };
    }
  }
  if (!best) {
    if ((fs && from.room && !fLinks.length) || (ts && to.room && !tLinks.length))
      return { error: `No mapped entrance is within ${DOOR_LINK_M} m of an indoor entrance room, so the indoor and outdoor maps cannot be joined here.` };
    return { error: `No ${accessible ? 'step-free ' : ''}outdoor route on the mapped paths joins these entrances.` };
  }
  const outLeg = best.legs.find((l) => l.kind === 'outdoor') as Extract<TripLeg, { kind: 'outdoor' }>;
  if (outLeg.route.usesSteps) notes.push('The outdoor part uses steps.');
  if (outLeg.route.connectorsM.length) notes.push(`Joins to the path network are straight lines of ${outLeg.route.connectorsM.map((m) => `${Math.round(m)} m`).join(' and ')} (the entrance is not on a mapped path).`);
  for (const l of best.legs) if (l.kind === 'indoor' && l.door) notes.push(`${l.buildingId}: the ${l.door.door.kind === 'main' ? 'main ' : ''}door is ${Math.round(l.door.m)} m from ${l.door.room.name} (estimated link; the door is not in the indoor map).`);
  notes.push('Paths and entrances are unreviewed OpenStreetMap data; this route has not been walked.');
  best.notes = [...new Set([...notes])];
  return best;
}
