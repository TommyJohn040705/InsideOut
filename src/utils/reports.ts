/** Problem reports, saved on this device and synced to the server store. Shown on the room until someone marks them fixed. */

export interface RoomReport {
  id: string;
  roomId: string | null;
  roomLabel: string;
  floor: number | null;
  type: string;
  details: string;
  createdAt: string;
  confirmations: number;
}

export const REPORT_TYPES: { value: string; label: string; department?: string; hotline?: string }[] = [
  { value: 'classroom_av', label: 'Classroom AV / Projector / Microphone issue', department: 'IST Classroom AV', hotline: 'ext. 44357' },
  { value: 'door_locked', label: 'Door locked or WatCard reader failed', department: 'Plant Ops / Security', hotline: 'ext. 22222' },
  { value: 'elevator_out', label: 'Elevator out of service', department: 'Plant Operations', hotline: 'ext. 33793' },
  { value: 'spill_custodial', label: 'Spill or custodial cleanup required', department: 'Plant Operations Custodial', hotline: 'ext. 33793' },
  { value: 'supplies_missing', label: 'Whiteboard markers or supplies missing', department: 'SDC / Dept Office', hotline: 'ext. 31002' },
  { value: 'heating_cooling', label: 'Room too hot / cold / ventilation issue', department: 'Plant Operations', hotline: 'ext. 33793' },
  { value: 'hallway_blocked', label: 'Hallway closed or obstructed', department: 'Safety Office', hotline: 'ext. 33587' },
  { value: 'maintenance', label: 'General maintenance or broken fixture', department: 'Plant Operations', hotline: 'ext. 33793' },
  { value: 'wrong_info', label: 'Room name or purpose is wrong' },
  { value: 'wrong_spot', label: 'Room is in the wrong spot on the map' },
  { value: 'other', label: 'Something else' },
];
export const reportLabel = (t: string) => REPORT_TYPES.find((x) => x.value === t)?.label || 'Problem';
export const reportDept = (t: string) => REPORT_TYPES.find((x) => x.value === t)?.department;
export const reportHotline = (t: string) => REPORT_TYPES.find((x) => x.value === t)?.hotline;

const KEY = 'floornav.reports.v1';
export function loadReports(): RoomReport[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; }
}
export function saveReports(list: RoomReport[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  pushStore('reports', list);
}

/* ---- Reports that close part of the route -------------------------------------------
 * Lifecycle ported from InsideOut feature/preview-firebase (src/lib/reports.ts): a report
 * lapses after a few hours unless someone confirms it again (confirming refreshes createdAt).
 * Routing only avoids a closure once a second person has confirmed it; a lone report is
 * shown as a warning instead, so one mistaken tap cannot remove the only step-free route.
 */
import type { FloorPlanData, VerticalCirculationLink } from '../types/navigation';
import { pushStore } from './serverStore';
import type { RouteClosures } from './pathfinding';

export const REPORT_TTL_MS = 4 * 60 * 60 * 1000;
export const CONFIRMATIONS_TO_CLOSE = 2;

export const isReportActive = (r: RoomReport, now = Date.now()) => now - new Date(r.createdAt).getTime() < REPORT_TTL_MS;

export function routeClosures(reports: RoomReport[], plans: FloorPlanData[], links: VerticalCirculationLink[], now = Date.now()): RouteClosures {
  const out: RouteClosures = { nodeIds: new Set(), linkIds: new Set(), unconfirmedLinkIds: new Set() };
  for (const r of reports) {
    if (!r.roomId || !isReportActive(r, now)) continue;
    if (r.type !== 'elevator_out' && r.type !== 'hallway_blocked') continue;
    const confirmed = r.confirmations >= CONFIRMATIONS_TO_CLOSE;
    const plan = plans.find((p) => p.rooms.some((x) => x.id === r.roomId));
    const room = plan?.rooms.find((x) => x.id === r.roomId);
    if (!plan || !room) continue;

    // A report on an elevator or stair room closes that whole shaft.
    const wanted = r.type === 'elevator_out' ? 'elevator' : 'stairs';
    const link = links.find((l) => l.type === wanted && l.nodes.some((n) => n.roomId === r.roomId))
      // e.g. the second elevator car, which is a room but not a stop in the link data
      || (r.type === 'elevator_out' && room.category === 'elevator' ? links.find((l) => l.type === 'elevator' && l.floorsServed.includes(plan.floorNumber)) : undefined);
    if (link) { (confirmed ? out.linkIds : out.unconfirmedLinkIds).add(link.id); continue; }

    // A blocked hallway closes the corridor points inside the reported room's outline.
    if (r.type === 'hallway_blocked' && confirmed) {
      out.nodeIds.add(room.id);
      const b = room.bounds;
      if (b) for (const h of plan.hallways) {
        if (h.coords.x >= b.x && h.coords.x <= b.x + b.width && h.coords.y >= b.y && h.coords.y <= b.y + b.height) out.nodeIds.add(h.id);
      }
    }
  }
  return out;
}
