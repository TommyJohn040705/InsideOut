/**
 * Room-to-room trips across campus: indoor route to a building door, outdoor walk on the
 * OpenStreetMap path network, indoor route from the destination door. The same code serves
 * every building; a building takes part indoors only when it has a georeferenced indoor
 * dataset (E5's traced drawings, or a published floor-plan import).
 */
import type { FloorPlanData, NavigationRoute, RoomPOI } from '../types/navigation';
import { calculateIndoorRoute } from '../utils/pathfinding';
import { distanceM, type Georef, type LngLat } from './georef';
import { FOOTPRINTS, INDOOR, buildingById, entrancesOf, georefFor, type CampusEntrance } from './campusData';
import { importAppBuildingId, georefOfImport, verticalLinksFor, type FloorImport, type ManualShaft } from './floorImports';
import { routeOutdoor, type OutdoorGraph, type OutdoorRoute } from './outdoorRoute';
import buildingLinksJson from '../data/campus/buildingLinks.json';

/** Indoor connections between neighbouring buildings (bridges, tunnels, link corridors), read off the placed drawings by scripts/campus/findConnections.ts. */
export interface BuildingLink {
  a: { building: string; floor: number; at: LngLat }; b: { building: string; floor: number; at: LngLat }; gapM: number;
  /** 'UW campus GIS' for the university's own link and tunnel layers (scripts/campus/gisLinks.ts); absent for links found on the drawings. */
  source?: string; kind?: 'link' | 'tunnel'; name?: string; floorsFrom?: 'drawings' | 'estimate';
}
export const BUILDING_LINKS = buildingLinksJson as unknown as BuildingLink[];
/** Buildings connected indoors to this one (a trip through connections may pass through any of them). */
export const linkedBuildings = (id: string) => [...new Set(BUILDING_LINKS.flatMap((l) => (l.a.building === id ? [l.b.building] : l.b.building === id ? [l.a.building] : [])))];
/** An indoor trip through connections is preferred unless it is this much longer than going outside. */
const INDOOR_PREFERENCE = 1.3;

export interface IndoorSite {
  buildingId: string;
  /** buildingId of this site's floors in the indoor navigator. */
  appBuildingId: string;
  plans: FloorPlanData[];
  georef(floor: number): Georef | null;
  /** Where the alignment comes from, for the UI. */
  alignment: string;
  /** Stairs and elevators linked by hand in the floor-plan studio. */
  manual?: ManualShaft[];
}

export function indoorSites(plans: FloorPlanData[], imports: FloorImport[], shaftLinks: Record<string, ManualShaft[]> = {}): Record<string, IndoorSite> {
  const out: Record<string, IndoorSite> = {};
  for (const [id, d] of Object.entries(INDOOR)) {
    out[id] = { buildingId: id, appBuildingId: d.appBuildingId, plans: plans.filter((p) => p.buildingId === d.appBuildingId), georef: (f) => georefFor(id, f), alignment: `Draft fit to the OpenStreetMap footprint (${d.georef.rmsM.toFixed(1)} m fit error)` };
  }
  const byB = new Map<string, FloorImport[]>();
  for (const f of imports) if (f.published) byB.set(f.buildingId, [...(byB.get(f.buildingId) || []), f]);
  for (const [id, fl] of byB) {
    if (out[id]) continue; // a building's own traced dataset wins over an import
    out[id] = {
      buildingId: id,
      appBuildingId: importAppBuildingId(id),
      manual: shaftLinks[id],
      plans: plans.filter((p) => p.buildingId === importAppBuildingId(id)),
      georef: (n) => { const f = fl.find((x) => x.floorNumber === n); return f ? georefOfImport(f) : null; },
      alignment: !fl.some((f) => georefOfImport(f)) ? 'Not aligned to the map yet'
        : `${fl.some((f) => f.alignmentFrom?.startsWith('auto?:')) ? 'ORIENTATION UNCERTAIN (the plan may be turned 180°; fix it under Floor plans). ' : ''}${fl.some((f) => f.alignmentFrom?.startsWith('auto')) ? 'Automatic fit of the plan outline to the OpenStreetMap footprint' : 'Control points set in the floor-plan studio'}${fl.every((f) => f.reviewed) ? ', reviewed' : ', not reviewed'}`,
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
    if (!best && site.appBuildingId.startsWith('import-')) best = doorAtNetwork(site, door);
    if (best) out.push(best);
  }
  return out;
}

/** Furthest a door may be from a floor's hallway network to enter there (m). */
export const DOOR_NETWORK_M = 8;

/**
 * No entrance room near this door: enter at the nearest hallway node, preferring the ground floor.
 * The door itself is not in the indoor map, so the link is an estimate and says so.
 */
function doorAtNetwork(site: IndoorSite, door: CampusEntrance): DoorLink | null {
  let best: DoorLink | null = null;
  for (const p of [...site.plans].sort((a, b) => Math.abs(a.floorNumber - 1) - Math.abs(b.floorNumber - 1))) {
    const g = site.georef(p.floorNumber);
    if (!g || !p.hallways.length) continue;
    for (const h of p.hallways) {
      const m = distanceM(door.position, g.pctToLngLat(h.coords));
      if (m <= DOOR_NETWORK_M && (!best || m < best.m)) best = { door, m, room: { id: `door-${door.id}`, name: door.name || 'Entrance', category: 'entrance', coords: h.coords, floor: p.floorNumber } as RoomPOI };
    }
    if (best) return best; // nearest floor to the ground that has a match
  }
  return best;
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
    return calculateIndoorRoute(pa, a.coords, a.name, b.coords, b.name, a.id, b.id, { isAccessibleOnly: accessible, allFloors: site.plans, startFloor: a.floor!, endFloor: b.floor!, verticalLinks: site.appBuildingId.startsWith('import-') ? verticalLinksFor(site.plans, (f, p) => site.georef(f)?.pctToLngLat(p) ?? null, site.manual) : undefined });
  } catch { return null; }
}

const doorName = (d: CampusEntrance, b: string) => `${nameOf(b)} ${d.name || (d.kind === 'main' ? 'main entrance' : 'entrance')}`;

/** A building's short name for messages: its code, else its name, never an internal id. */
const nameOf = (id: string) => { const b = buildingById(id); return b?.code || b?.name || id; };

/**
 * A building with no entrance in OpenStreetMap: aim for the corners of its footprint nearest to where
 * the trip comes from, and its centre (whichever joins the path network), so the trip still reaches it.
 * Not a real door, and said so.
 */
function edgesOf(buildingId: string, toward: LngLat | null): CampusEntrance[] {
  const b = buildingById(buildingId);
  const f = FOOTPRINTS.features.find((x) => (x.properties as { id?: string } | null)?.id === buildingId);
  const ring = f && (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flatMap((p) => p[0]) : null);
  const pts = (ring as LngLat[] | null) || (b?.center ? [b.center as LngLat] : []);
  if (!pts.length) return [];
  const near = toward ? [...pts].sort((x, y) => distanceM(x, toward) - distanceM(y, toward)).slice(0, 3) : [];
  return [...near, ...(b?.center ? [b.center as LngLat] : [])].map((at, i) => ({ id: `edge-${buildingId}-${i}`, buildingId, position: at, kind: 'estimate', name: 'nearest side (no entrance mapped)', level: null, wheelchair: 'unknown', source: 'estimate', validation: 'unreviewed' }));
}

function candidateDoors(buildingId: string, accessible: boolean, toward: LngLat | null, notes: string[]): CampusEntrance[] {
  let doors = entrancesOf(buildingId);
  if (!doors.length) {
    const e = edgesOf(buildingId, toward);
    if (e.length) notes.push(`${nameOf(buildingId)} has no entrance mapped in OpenStreetMap: the route goes to the nearest side of the building; find the door there.`);
    return e;
  }
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
    if (!r) return { error: `No indoor route between those rooms in ${nameOf(from.buildingId)}.` };
    return { legs: [{ kind: 'indoor', buildingId: from.buildingId, route: r }], notes, totalM: r.totalDistanceMeters, line: [] };
  }

  // Connected buildings: stay indoors through the connection when that is not much longer.
  const through = fs && ts && from.room && to.room ? indoorThroughLinks(sites, from, to, accessible) : null;
  const viaOutside = outsideTrip();
  if (through && (!('legs' in viaOutside) || through.totalM <= viaOutside.totalM * INDOOR_PREFERENCE)) return through;
  return viaOutside;

  function outsideTrip(): Trip | { error: string } {
  const centre = (e: TripEnd) => e.at || (e.buildingId ? buildingById(e.buildingId)?.center || null : null);
  const fromDoors: (CampusEntrance | null)[] = from.buildingId ? candidateDoors(from.buildingId, accessible, from.at || centre(to), notes) : [null];
  const toDoors = to.buildingId ? candidateDoors(to.buildingId, accessible, centre(from), notes) : [];
  if (from.buildingId && !fromDoors.length) return { error: `${nameOf(from.buildingId)} is not on the map, so no outdoor route can start there.` };
  if (!to.buildingId || !toDoors.length) return { error: `${to.buildingId ? nameOf(to.buildingId) : 'The destination'} is not on the map, so no route can reach it.` };

  const fLinks = fs && from.room ? doorLinks(fs, from.buildingId!) : [];
  const tLinks = ts && to.room ? doorLinks(ts, to.buildingId!) : [];
  if (from.room && !fs) notes.push(`${nameOf(from.buildingId!)} has no indoor routing map: walk from ${from.label} to the ${nameOf(from.buildingId!)} exit yourself.`);
  if (to.room && !ts) notes.push(`${nameOf(to.buildingId!)} has no indoor routing map: from the door, find ${to.label} yourself.`);

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
  for (const l of best.legs) if (l.kind === 'indoor' && l.door) notes.push(`${nameOf(l.buildingId)}: the ${l.door.door.kind === 'main' ? 'main ' : ''}door is ${Math.round(l.door.m)} m from ${l.door.room.name} (estimated link; the door is not in the indoor map).`);
  notes.push('Paths and entrances are unreviewed OpenStreetMap data; this route has not been walked.');
  best.notes = [...new Set([...notes])];
  return best;
  }
}

/**
 * Indoor trip between two buildings through their connections, passing through at most one
 * building in between: each building is walked from where you enter it (the start room, or the
 * connection you came through) to where you leave it. Null when no chain of connections works.
 */
export function indoorThroughLinks(sites: Record<string, IndoorSite>, from: TripEnd, to: TripEnd, accessible: boolean, links: BuildingLink[] = BUILDING_LINKS): Trip | null {
  const A = from.buildingId!, B = to.buildingId!;
  const ends = (l: BuildingLink, x: string) => (l.a.building === x ? [l.a, l.b] : [l.b, l.a]);
  const linksOf = (x: string) => links.filter((l) => (l.a.building === x || l.b.building === x) && sites[l.a.building] && sites[l.b.building]);
  // Chains of links: A-B directly, or A-X-B.
  const chains: BuildingLink[][] = [];
  for (const l of linksOf(A)) {
    const [, far] = ends(l, A);
    if (far.building === B) chains.push([l]);
    else for (const m of linksOf(far.building)) { const [, far2] = ends(m, far.building); if (far2.building === B) chains.push([l, m]); }
  }
  // The connection's map position, on that building's indoor map.
  const spot = (e: BuildingLink['a'], other: string): RoomPOI | null => { const g = sites[e.building].georef(e.floor); return g ? ({ id: `link-${e.building}-${e.floor}-${other}`, name: `Connection to ${other}`, category: 'other', coords: g.lngLatToPct(e.at), floor: e.floor } as RoomPOI) : null; };
  let best: Trip | null = null;
  for (const chain of chains) {
    // Floors with different numbers may not meet level: skip them on a step-free trip.
    if (accessible && chain.some((l) => l.a.floor !== l.b.floor)) continue;
    const legs: TripLeg[] = [];
    let total = 0, here: RoomPOI = from.room!, building = A, ok = true;
    for (const l of chain) {
      const [near, far] = ends(l, building);
      const exit = spot(near, far.building), entry = spot(far, near.building);
      const r = exit && entry ? indoor(sites[building], here, exit, accessible) : null;
      if (!r || !entry) { ok = false; break; }
      legs.push({ kind: 'indoor', buildingId: building, route: r });
      total += r.totalDistanceMeters + l.gapM;
      building = far.building; here = entry;
    }
    if (!ok) continue;
    const last = indoor(sites[building], here, to.room!, accessible);
    if (!last) continue;
    legs.push({ kind: 'indoor', buildingId: building, route: last });
    total += last.totalDistanceMeters;
    if (best && total >= best.totalM) continue;
    best = {
      // Drawn on the campus map: every leg's walk, floor by floor, on that building's map.
      legs, totalM: Math.round(total),
      line: legs.flatMap((l) => l.kind === 'indoor' ? l.route.floorSegments.flatMap((s) => { const g = sites[l.buildingId].georef(s.floor); return g ? s.waypoints.map((w) => g.pctToLngLat(w)) : []; }) : []),
      notes: [
        `Stays indoors: through the ${chain.map((l) => `${l.kind === 'tunnel' ? 'tunnel' : 'connection'} ${l.a.building}–${l.b.building} (floor ${l.a.floor === l.b.floor ? l.a.floor : l.a.floor + '/' + l.b.floor})`).join(' and ')}.`,
        chain.some((l) => l.source) ? `From the UW campus GIS: ${chain.filter((l) => l.source).map((l) => `${l.kind === 'tunnel' ? 'tunnel' : 'link'} ${l.a.building}–${l.b.building}`).join(', ')}; ${chain.some((l) => l.floorsFrom === 'estimate') ? 'which floors it joins is estimated' : 'the floors it joins are read off the drawings'}. Not walked.` : 'Connections between buildings are read off the floor-plan drawings; not walked.',
      ],
    };
  }
  return best;
}
