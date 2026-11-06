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

export const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'elevator_out', label: 'Elevator not working' },
  { value: 'door_locked', label: 'Door locked or blocked' },
  { value: 'hallway_blocked', label: 'Hallway closed or blocked' },
  { value: 'maintenance', label: 'Needs maintenance or cleaning' },
  { value: 'wrong_info', label: 'Room name or purpose is wrong' },
  { value: 'wrong_spot', label: 'Room is in the wrong spot on the map' },
  { value: 'other', label: 'Something else' },
];
export const reportLabel = (t: string) => REPORT_TYPES.find((x) => x.value === t)?.label || 'Problem';

const KEY = 'floornav.reports.v1';
export function loadReports(): RoomReport[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; }
}
export function saveReports(list: RoomReport[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}
