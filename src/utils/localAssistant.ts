/**
 * Answers common wayfinding questions on the device, with no server:
 * nearest washroom / elevator / stairs / entrance, food, and "where is room X".
 * Distances are real walking routes, not straight lines.
 */
import { FloorPlanData, RoomPOI } from '../types/navigation';
import { calculateIndoorRoute } from './pathfinding';
import { BuildingFact, E5_FACTS } from '../data/e5/facts';

export interface LocalAnswer {
  answer: string;
  room?: RoomPOI;
  sources?: { title: string; url: string }[];
}

const INTENTS: { key: string; words: RegExp; cats: string[]; label: string }[] = [
  { key: 'restroom', words: /\b(wash ?rooms?|rest ?rooms?|bathrooms?|toilets?|loo|washroom)\b/i, cats: ['restroom'], label: 'washroom' },
  { key: 'elevator', words: /\b(elevators?|lifts?)\b/i, cats: ['elevator'], label: 'elevator' },
  { key: 'stairs', words: /\b(stairs?|stairwells?|staircase)\b/i, cats: ['stairs'], label: 'stairwell' },
  { key: 'exit', words: /\b(exits?|entrances?|way out|leave the building|emergency exit)\b/i, cats: ['entrance', 'exit'], label: 'entrance or exit' },
];

const FOOD = /\b(food|coffee|cafe|café|eat|lunch|snacks?|vending|drink|tim hortons)\b/i;

function withFloor(r: RoomPOI, p: FloorPlanData): RoomPOI {
  return { ...r, floor: r.floor ?? p.floorNumber };
}

function nearest(cats: string[], from: RoomPOI, plans: FloorPlanData[], accessible: boolean) {
  const all = plans.flatMap((p) => p.rooms.filter((r) => cats.includes(r.category)).map((r) => withFloor(r, p)));
  if (!all.length) return null;
  const f = from.floor ?? 1;
  // prefer same floor, then nearby floors; only route the closest few for speed
  const shortlist = all
    .map((r) => ({ r, guess: Math.abs((r.floor ?? f) - f) * 40 + Math.hypot((r.coords.x - from.coords.x) * 3.09, r.coords.y - from.coords.y) * 0.34 }))
    .sort((a, b) => a.guess - b.guess)
    .slice(0, 4);
  let best: { r: RoomPOI; m: number; min: number } | null = null;
  for (const { r } of shortlist) {
    const sPlan = plans.find((p) => p.floorNumber === f) || plans[0];
    const route = calculateIndoorRoute(sPlan, from.coords, from.name, r.coords, r.name, from.id, r.id, {
      isAccessibleOnly: accessible, allFloors: plans, startFloor: f, endFloor: r.floor ?? f,
    });
    if (!best || route.totalDistanceMeters < best.m) best = { r, m: route.totalDistanceMeters, min: route.estimatedWalkTimeMinutes };
  }
  return best;
}

function factSources(facts: BuildingFact[]) {
  const seen = new Set<string>();
  return facts.filter((f) => !seen.has(f.sourceUrl) && seen.add(f.sourceUrl)).map((f) => ({ title: f.sourceTitle, url: f.sourceUrl }));
}

export function answerLocally(q: string, from: RoomPOI | null, plans: FloorPlanData[], accessible: boolean, isE5: boolean): LocalAnswer | null {
  const text = q.trim();
  if (!text) return null;

  // a room number like "3101", "E5 2108", "e5-6005"
  const num = text.match(/\b(?:e5[\s-]*)?(\d{4}[a-z]?)\b/i);
  if (num) {
    const n = num[1].toUpperCase();
    for (const p of plans) {
      const r = p.rooms.find((x) => (x.roomNumber || '').toUpperCase() === n);
      if (r) {
        const room = withFloor(r, p);
        const verified = r.purposeVerification === 'verified_official_source' || r.purposeVerification === 'web_lookup_user_approved';
        return {
          answer: `${r.roomNumber} is on floor ${room.floor}: ${r.name}.${r.purpose && verified ? ` ${r.purpose}` : ' Its purpose is not verified yet.'}`,
          room,
          sources: verified && r.sourceUrl ? [{ title: 'Source', url: r.sourceUrl }] : undefined,
        };
      }
    }
    return { answer: `I couldn't find room ${n} on this building's map. Check the number, or use "Look up a room" to search the web for it.` };
  }

  if (FOOD.test(text)) {
    if (!isE5) return { answer: "I don't have verified food information for this building yet." };
    const facts = E5_FACTS.filter((f) => ['food-none-inside', 'vending-6', 'plaza-food'].includes(f.id));
    return {
      answer: 'There is no cafe listed inside E5. Vending machines are on the 6th floor, and University Plaza next door has several food options.',
      sources: factSources(facts),
    };
  }

  if (/\b(e3|overpass|bridge)\b/i.test(text) && isE5) {
    const f = E5_FACTS.find((x) => x.id === 'e3-overpass')!;
    return { answer: `There is an overpass to E3, but the official page lists it on both the 3rd and 5th floors, so check on site.`, sources: factSources([f]) };
  }

  for (const it of INTENTS) {
    if (!it.words.test(text)) continue;
    if (!from) return { answer: `Set a starting point first, then I can find the nearest ${it.label}.` };
    const best = nearest(it.cats, from, plans, accessible && it.key !== 'stairs');
    if (!best) return { answer: `There is no ${it.label} on this building's map yet.` };
    const where = best.r.floor === from.floor ? 'on this floor' : `on floor ${best.r.floor}`;
    return {
      answer: `The nearest ${it.label} is ${best.r.name}${best.r.roomNumber && !best.r.name.includes(best.r.roomNumber) ? ` (${best.r.roomNumber})` : ''}, ${where}, about ${Math.round(best.m)} m away (${Math.max(1, Math.round(best.min))} min walk).`,
      room: best.r,
    };
  }
  return null;
}
