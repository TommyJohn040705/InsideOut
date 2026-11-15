/**
 * "Tell us in words": reads a sentence like "I'm at 2416 and I need room 5338" or "nearest washroom
 * from 1101" against this building's rooms. Local and instant; no AI needed for this.
 */
import type { RoomPOI } from '../types/navigation';

export type Nearest = 'restroom' | 'elevator' | 'exit';
export interface TripWords { start?: RoomPOI; end?: RoomPOI; nearest?: Nearest; message?: string }

const NEAREST: [RegExp, Nearest][] = [
  [/\b(washroom|bathroom|restroom|toilet|wc)s?\b/i, 'restroom'],
  [/\b(elevator|lift)s?\b/i, 'elevator'],
  [/\b(exit|way out|entrance|door out)s?\b/i, 'exit'],
];

export function readTripWords(text: string, rooms: RoomPOI[]): TripWords {
  const nums = [...text.toUpperCase().matchAll(/\b(?:[A-Z]{1,4}\s?)?([B0-9]?\d{2,3}[A-Z]?)\b/g)].map((m) => m[1]);
  const find = (n: string) => rooms.find((r) => (r.roomNumber || '').toUpperCase() === n);
  const found = nums.map((n) => ({ n, r: find(n) }));
  const missing = found.filter((f) => !f.r).map((f) => f.n);
  const hit = found.filter((f) => f.r).map((f) => f.r!);
  const nearest = NEAREST.find(([re]) => re.test(text))?.[1];
  // "I'm at A ... B": the first room is where you are, the second where you're going.
  // With one room and "nearest X", that room is the start; with one room alone, it is the destination.
  const out: TripWords = nearest ? { start: hit[0], nearest } : hit.length >= 2 ? { start: hit[0], end: hit[1] } : { end: hit[0] };
  if (missing.length) out.message = `I couldn't find room ${missing.join(' or ')} in this building. Check the number on the door sign.`;
  else if (!hit.length && !nearest) out.message = 'Tell me a room number, for example "I\'m at 2416 and I need room 5338".';
  return out;
}
