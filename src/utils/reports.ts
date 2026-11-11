/** Problem reports, saved on this device. Shown on the room until someone marks them fixed. */

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
}
