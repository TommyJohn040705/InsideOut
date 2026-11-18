/**
 * Rooms from OCR of a Plant Operations floor plan (scripts/campus/ocrRooms.ts runs tesseract.js on
 * the sheet at several rotations). Only room numbers are on the drawings; a type is set only when
 * the drawing's own label says so (ELV next to the number, or a lone M / W / A washroom letter).
 */
import type { RoomPOI } from '../types/navigation';

export interface OcrWord { text: string; confidence: number; x: number; y: number; h: number } // centre and height in image percent

/** First character of room numbers on this floor: "01" -> "1", "B1" -> "B" (or "0"). */
export function floorDigits(floorCode: string, floorNumber: number): string[] {
  if (/^B/i.test(floorCode) || floorNumber <= 0) return ['B', '0'];
  const d = String(Math.floor(floorNumber));
  return [d.slice(-1)];
}

const ROOM = /^[B0-9]?\d{3}[A-Z]?$/;

export function roomsFromOcr(words: OcrWord[], floorCode: string, floorNumber: number, idPrefix: string): RoomPOI[] {
  const digits = floorDigits(floorCode, floorNumber);
  const numbers = words.filter((w) => w.confidence >= 60 && ROOM.test(w.text));
  // Most numbers 4 long and starting with the floor digit: a 3-long read lost its first digit.
  const four = numbers.filter((w) => /^\d{4}[A-Z]?$/.test(w.text) && digits.includes(w.text[0])).length;
  const fixFirst = numbers.length >= 10 && four / numbers.length >= 0.7;
  const kept: (OcrWord & { n: string })[] = [];
  for (const w of numbers) {
    let n = w.text;
    // "776D" lost its leading floor digit; "172" (already starting with it) lost a digit we can't know.
    if (fixFirst && /^\d{3}[A-Z]?$/.test(n)) { if (digits.includes(n[0])) continue; n = digits[0] + n; }
    if (!digits.includes(n[0])) continue;
    const dup = kept.find((k) => k.n === n);
    if (dup) { if (w.confidence > dup.confidence) Object.assign(dup, w, { n }); continue; }
    kept.push({ ...w, n });
  }
  const labels = words.filter((w) => w.confidence >= 60 && /^(ELV|M|W|A)$/.test(w.text));
  const near = (a: OcrWord, b: OcrWord) => Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(a.h, b.h) * 3;
  // An "ELV" label with no room number beside it still marks an elevator; floors link through these.
  const lone: OcrWord[] = [];
  for (const l of labels) if (l.text === 'ELV' && !kept.some((k) => near(l, k)) && !lone.some((o) => near(o, l))) lone.push(l);
  const elevators = lone.map((l, i) => ({
    id: `${idPrefix}-elv${i + 1}`, name: 'Elevator', category: 'elevator', coords: { x: +l.x.toFixed(2), y: +l.y.toFixed(2) },
    floor: floorNumber, purposeVerification: 'unverified_drawing_only',
  } as RoomPOI));
  return [...elevators, ...kept.map((k) => {
    const label = labels.find((l) => near(l, k));
    const category = label?.text === 'ELV' ? 'elevator' : label ? 'restroom' : 'other';
    return {
      id: `${idPrefix}-o${k.n}`,
      roomNumber: k.n,
      name: category === 'elevator' ? `Elevator ${k.n}` : category === 'restroom' ? `Washroom ${k.n}` : `Room ${k.n}`,
      category,
      coords: { x: +k.x.toFixed(2), y: +k.y.toFixed(2) },
      floor: floorNumber,
      purposeVerification: 'unverified_drawing_only',
    } as RoomPOI;
  })];
}
