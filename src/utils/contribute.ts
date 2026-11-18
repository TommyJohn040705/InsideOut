/**
 * Turns what someone typed into proposed map changes when the AI server is not available.
 * The AI endpoint (/api/contribute) does the same job better; this keeps the app usable offline.
 */
import { POICategory, RoomPOI } from '../types/navigation';

export type ChangeKind = 'room_update' | 'report' | 'floor_plan';
export interface MapChange {
  kind: ChangeKind;
  roomNumber?: string;
  name?: string;
  category?: POICategory | string;
  purpose?: string;
  reportType?: string;
  details?: string;
}

const REPORT_RULES: { type: string; re: RegExp }[] = [
  { type: 'elevator_out', re: /\b(elevator|lift)s?\b.*\b(out|broken|down|not working|stuck|dead)\b|\bout of order\b/i },
  { type: 'door_locked', re: /\bdoors?\b.*\b(locked|stuck|jammed|won'?t open|blocked)\b|\blocked\b/i },
  { type: 'hallway_blocked', re: /\b(hallway|corridor|hall|stairs?|stairwell|path)\b.*\b(blocked|closed|construction)\b|\bconstruction\b/i },
  { type: 'maintenance', re: /\b(leak|leaking|dirty|spill|needs? clean|cleaning|broken|light'?s? out|no (paper|soap)|trash|garbage|smell|flood)/i },
  { type: 'wrong_info', re: /\b(wrong|incorrect|outdated)\b.*\b(name|label|info|room|sign)\b/i },
];

const NUM = /\b(?:e5[\s-]*)?(\d{4}[a-z]?)\b/gi;

export function parseLocally(text: string, preset: RoomPOI | null): MapChange[] {
  const t = text.trim();
  if (!t) return [];
  const nums = Array.from(t.matchAll(NUM)).map((m) => m[1].toUpperCase());
  const roomNumber = nums[0] || preset?.roomNumber || '';
  const report = REPORT_RULES.find((r) => r.re.test(t));
  if (report) return [{ kind: 'report', roomNumber, reportType: report.type, details: t }];
  if (!roomNumber) return [];
  const purpose = t.replace(/\bE5[\s-]*/gi, '').replace(new RegExp(`\\b${roomNumber}\\b`, 'i'), '').replace(/^[\s,:.-]+/, '').replace(/^(is|are|was|=)\s+(now\s+)?(the|a|an)?\s*/i, '').trim();
  if (!purpose) return [];
  const name = purpose.split(/[.,\n]/)[0].trim().slice(0, 48);
  return [{ kind: 'room_update', roomNumber, name: name.charAt(0).toUpperCase() + name.slice(1), purpose: purpose.charAt(0).toUpperCase() + purpose.slice(1) }];
}
