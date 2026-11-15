/**
 * Floor plans imported through the floor-plan studio. Shared by the server (which stores
 * them in data/store.json) and the app (which shows published ones on the campus map and
 * in the indoor navigator). Status is always derived from what the record actually holds.
 */
import type { CorridorNode, FloorPlanData, RoomPOI, VerticalCirculationLink } from '../types/navigation';
import { fitGeoref, type ControlPoint, type Georef } from './georef';
import type { FloorStatus } from './campusData';

export interface FloorImport {
  id: string;
  /** Campus building id (src/data/campus/buildings.json), e.g. "DC". */
  buildingId: string;
  floorCode: string;
  floorNumber: number;
  /** Plant Operations manifest filename this file corresponds to, when known. */
  manifestFilename: string | null;
  restricted: boolean;
  /** Who said they may use the document, and on what basis (free text, required). */
  authorization: string;
  sourceName: string;
  sourceMime: string;
  /** Original upload, served by this app's server only. */
  fileUrl: string;
  /** Raster used for display and extraction (the PDF's first page for PDFs). */
  imageUrl: string;
  imageSize: [number, number];
  uploadedAt: string;
  /** Room labels read from the PDF's own text layer (no AI), in image percent. */
  pdfLabels: { text: string; x: number; y: number }[];
  extraction: null | { model: string; at: string; title?: string; summary?: string };
  rooms: RoomPOI[];
  hallways: CorridorNode[];
  controlPoints: ControlPoint[];
  /** Set when the control points were copied from another floor of the same drawing series. */
  alignmentFrom?: string;
  reviewed: boolean;
  reviewedAt?: string;
  published: boolean;
  /** Hallway network read automatically off the drawing (src/campus/planGraph.ts); used until hand-drawn hallways are reviewed. */
  autoHallways?: CorridorNode[];
  autoHallwaysAt?: string;
}

/** Metres per 1% of image height from this floor's alignment, else from another aligned floor of the building. */
export function metresPerPctOf(f: FloorImport, sameBuilding: FloorImport[] = []): number | undefined {
  for (const x of [f, ...sameBuilding]) {
    const g = georefOfImport(x);
    if (g && x.imageSize[1] === f.imageSize[1]) return (g.metresPerPixel * x.imageSize[1]) / 100;
  }
  return undefined;
}

/** True when routing on this floor uses the automatic network, not reviewed hand-drawn hallways. */
export const usesAutoHallways = (f: FloorImport) => importStatus(f) !== 'routing_available' && !!f.autoHallways?.length;

/** Problems that keep a floor's hallway graph from being used for routing. */
export function graphProblems(rooms: RoomPOI[], hallways: CorridorNode[]): string[] {
  const out: string[] = [];
  if (!hallways.length) return ['No hallway nodes.'];
  const ids = new Set(hallways.map((h) => h.id));
  const adj = new Map<string, Set<string>>(hallways.map((h) => [h.id, new Set<string>()]));
  for (const h of hallways) for (const t of h.connectedTo) if (ids.has(t)) { adj.get(h.id)!.add(t); adj.get(t)!.add(h.id); }
  const seen = new Set<string>([hallways[0].id]);
  const stack = [hallways[0].id];
  while (stack.length) for (const n of adj.get(stack.pop()!)!) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (seen.size < hallways.length) out.push(`${hallways.length - seen.size} hallway nodes are not connected to the rest.`);
  const linked = new Set(hallways.flatMap((h) => h.connectedTo));
  const loose = rooms.filter((r) => !linked.has(r.id));
  if (loose.length) out.push(`${loose.length} rooms have no hallway connection (${loose.slice(0, 4).map((r) => r.roomNumber || r.name).join(', ')}${loose.length > 4 ? ', ...' : ''}).`);
  return out;
}

export function georefOfImport(f: FloorImport): Georef | null {
  if (f.controlPoints.length < 2) return null;
  try {
    return fitGeoref({ buildingId: f.buildingId, floors: [f.floorNumber], imageSize: f.imageSize, method: 'control_points_studio', review: f.reviewed ? 'human_reviewed' : 'draft_unreviewed', controlPoints: f.controlPoints });
  } catch { return null; }
}

/** Highest stage this record has really reached. Never reports route_verified: nothing here is walked. */
export function importStatus(f: FloorImport): FloorStatus {
  if (!f.fileUrl) return 'source_found';
  if (!f.rooms.length) return 'imported';
  if (!georefOfImport(f)) return 'geometry_extracted';
  if (!f.reviewed) return 'georeferenced';
  // A connected corridor network makes the floor routable; rooms not linked to it are warned about, not blocking.
  return f.hallways.length && !graphProblems([], f.hallways).length ? 'routing_available' : 'human_reviewed';
}

/** Floor button label for a Plant Operations floor code: "01" -> "1", "02FLR_MEZ" -> "2M", "CON" -> "Con". */
export function floorLabelOf(code: string, filename = ''): string {
  if (/02FLR_MEZ/i.test(filename)) return '2M';
  if (/_0M_MEZ/i.test(filename)) return 'Mez';
  if (/_0B_CON/i.test(filename)) return 'Con';
  if (code === '00') return 'G';
  return /^\d+$/.test(code) ? String(Number(code)) : code;
}

export const importAppBuildingId = (buildingId: string) => `import-${buildingId}`;

/** A published import as a floor the indoor navigator can open and route on. */
export function importToPlan(f: FloorImport, buildingName: string, sameBuilding: FloorImport[] = []): FloorPlanData {
  return {
    id: `import-${f.id}`,
    title: `${buildingName}, floor ${floorLabelOf(f.floorCode, f.sourceName)}`,
    subTitle: `${buildingName} · Plant Operations plan ${f.sourceName}`,
    floorLabel: floorLabelOf(f.floorCode, f.sourceName),
    floorNumber: f.floorNumber,
    buildingId: importAppBuildingId(f.buildingId),
    buildingName,
    buildingType: 'University',
    summary: f.extraction?.summary || '',
    imageUrl: f.imageUrl,
    rooms: f.rooms.map((r) => ({ ...r, floor: f.floorNumber, buildingId: importAppBuildingId(f.buildingId) })),
    // Reviewed, connected hand-drawn hallways win; otherwise the network read off the drawing.
    hallways: importStatus(f) === 'routing_available' ? f.hallways : f.autoHallways || [],
    autoHallways: usesAutoHallways(f),
    aspect: f.imageSize[0] / f.imageSize[1],
    metresPerPct: metresPerPctOf(f, sameBuilding),
    source: 'upload',
  };
}

/** PDF text items that look like room numbers ("1302", "2108A", "DC 1302"). */
export const roomNumberLabels = (labels: FloorImport['pdfLabels']) => labels.filter((l) => /^([A-Z]{1,4}\s?)?\d{3,4}[A-Z]?$/.test(l.text));

/**
 * Stairs and elevators of an imported building, matched across floors by room number: Plant
 * Operations repeats the number after the floor digit on every floor (1817, 2817, 3817). Only
 * shafts linked to a hand-drawn corridor on at least two floors become links.
 */
export function verticalLinksFor(plans: FloorPlanData[]): VerticalCirculationLink[] {
  // "1093 ELV" -> "093": the number after the floor digit, ignoring any trailing label.
  const suffix = (r: RoomPOI) => (r.roomNumber || '').match(/^\d(\d{3}[A-Z]?)\b/)?.[1];
  // A shaft read as elevator/stairs on one floor carries to the same number on other floors where the
  // reader called it a corridor or service room (lobbies, unlabelled shafts), never an office or classroom.
  const shaftType = new Map<string, 'elevator' | 'stairs'>();
  for (const p of plans) for (const r of p.rooms) {
    const s = suffix(r);
    if (s && (r.category === 'elevator' || (r.category === 'stairs' && !shaftType.has(s)))) shaftType.set(s, r.category);
  }
  const MAY_BE_SHAFT = new Set(['elevator', 'stairs', 'corridor', 'utility', 'other']);
  const groups = new Map<string, { floor: number; roomId: string; corridorNodeId: string; type: 'elevator' | 'stairs'; number: string }[]>();
  for (const p of plans) {
    const corridorOf = new Map<string, string>();
    for (const h of p.hallways) for (const t of h.connectedTo) if (!corridorOf.has(t)) corridorOf.set(t, h.id);
    for (const r of p.rooms) {
      const s = suffix(r), type = s ? shaftType.get(s) : undefined;
      if (!s || !type || !MAY_BE_SHAFT.has(r.category)) continue;
      const corridor = corridorOf.get(r.id);
      if (!corridor) continue;
      const key = `${type}:${s}`;
      const list = groups.get(key) || [];
      if (!list.some((x) => x.floor === p.floorNumber)) list.push({ floor: p.floorNumber, roomId: r.id, corridorNodeId: corridor, type, number: r.roomNumber!.match(/^\d+[A-Z]?/)![0] });
      groups.set(key, list);
    }
  }
  return [...groups.entries()].filter(([, l]) => l.length >= 2).map(([key, l]) => ({
    id: `v-${key}`,
    type: l[0].type,
    name: `${l[0].type === 'elevator' ? 'Elevator' : 'Stairs'} ${l.map((x) => x.number).join('/')}`,
    floorsServed: l.map((x) => x.floor).sort((a, b) => a - b),
    accessible: l[0].type === 'elevator',
    nodes: l.map(({ floor, roomId, corridorNodeId }) => ({ floor, roomId, corridorNodeId })),
    description: 'Matched by room number across floors (Plant Operations numbering); not checked on site.',
  }));
}

/** The same alignment turned 180° about the control points' centre (fixes an upside-down automatic fit). */
export function turnedControlPoints(f: FloorImport): FloorImport['controlPoints'] {
  const g = georefOfImport(f);
  if (!g) return f.controlPoints;
  const cx = f.controlPoints.reduce((s, c) => s + c.px[0], 0) / f.controlPoints.length;
  const cy = f.controlPoints.reduce((s, c) => s + c.px[1], 0) / f.controlPoints.length;
  return f.controlPoints.map((c) => {
    const [lng, lat] = g.pxToLngLat([2 * cx - c.px[0], 2 * cy - c.px[1]]);
    return { ...c, lngLat: [+lng.toFixed(7), +lat.toFixed(7)] };
  });
}
