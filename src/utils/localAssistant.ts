/**
 * Answers wayfinding questions on the device with zero server dependency:
 * nearest washroom / elevator / stairs / entrance, food, room search, rerouting,
 * positioning ("I'm standing near 2108"), and multi-floor navigation.
 * Distances are real walking routes, not straight lines.
 */
import { FloorPlanData, RoomPOI } from '../types/navigation';
import { calculateIndoorRoute } from './pathfinding';
import { BuildingFact, E5_FACTS } from '../data/e5/facts';

export interface LocalAnswer {
  answer: string;
  room?: RoomPOI;
  sources?: { title: string; url: string }[];
  suggestedAction?: 'reroute' | 'switch_floor' | 'set_start' | 'navigate';
  suggestedFloor?: number;
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
  // Prefer same floor, then nearby floors
  const shortlist = all
    .map((r) => ({ r, guess: Math.abs((r.floor ?? f) - f) * 40 + Math.hypot((r.coords.x - from.coords.x) * 3.09, r.coords.y - from.coords.y) * 0.34 }))
    .sort((a, b) => a.guess - b.guess)
    .slice(0, 4);
  let best: { r: RoomPOI; m: number; min: number } | null = null;
  for (const { r } of shortlist) {
    const sPlan = plans.find((p) => p.floorNumber === f) || plans[0];
    let route;
    try {
      route = calculateIndoorRoute(sPlan, from.coords, from.name, r.coords, r.name, from.id, r.id, {
        isAccessibleOnly: accessible, allFloors: plans, startFloor: f, endFloor: r.floor ?? f,
      });
    } catch { continue; } // no mapped way between those floors
    if (!best || route.totalDistanceMeters < best.m) best = { r, m: route.totalDistanceMeters, min: route.estimatedWalkTimeMinutes };
  }
  return best;
}

function factSources(facts: BuildingFact[]) {
  const seen = new Set<string>();
  return facts.filter((f) => !seen.has(f.sourceUrl) && seen.add(f.sourceUrl)).map((f) => ({ title: f.sourceTitle, url: f.sourceUrl }));
}

export function answerLocally(
  q: string,
  from: RoomPOI | null,
  plans: FloorPlanData[],
  accessible: boolean,
  isE5: boolean
): LocalAnswer | null {
  const text = q.trim();
  if (!text) return null;

  // Intent: "Where am I?"
  if (/\b(where am i|my location|current location|where i am)\b/i.test(text)) {
    if (from) {
      return {
        answer: `You are currently positioned at ${from.roomNumber ? `E5 ${from.roomNumber}` : from.name} on Level ${from.floor || 2}.`,
        room: from,
      };
    }
    return {
      answer: 'Your starting location is currently set to the Level 2 Main Campus Entrance (2811). Tap a room or scan a sign to update it.',
    };
  }

  // Intent: "I took the wrong hallway. Can you reroute?"
  if (/\b(wrong hallway|wrong turn|lost|reroute|recalculate|off path)\b/i.test(text)) {
    return {
      answer: 'Recalculating route from your current verified position. Follow the highlighted corridor line ahead.',
      suggestedAction: 'reroute',
    };
  }

  // Intent: "Which elevator do I use?"
  if (/\b(which elevator|what elevator|where is elevator|elevator bank)\b/i.test(text)) {
    return {
      answer: 'Use the Southeast passenger elevator bank (rooms 1801, 2801, 3801, 4801, 5801, 6801). It connects all 6 floors and is fully wheelchair accessible.',
      sources: isE5 ? [{ title: 'E5 Accessibility Catalog', url: 'https://uwaterloo.ca/accessibility/catalogs/building-accessibility/e5-engineering-5' }] : undefined,
    };
  }

  // Intent: "I'm at the main entrance. How do I get to the machine shop?"
  if (/\b(machine shop)\b/i.test(text)) {
    const shop = plans.flatMap((p) => p.rooms.map((r) => withFloor(r, p))).find((r) => r.roomNumber === '1101' || r.id === 'e5-1101');
    if (shop) {
      return {
        answer: `The Engineering Student Machine Shop (1101) is on Level 1. Take the Southeast elevator down to Level 1, then head west down the main design corridor.`,
        room: shop,
        suggestedAction: 'navigate',
      };
    }
  }

  // Intent: "Show floor 3" or "switch to level 4"
  const floorMatch = text.match(/\b(?:show|go to|view|switch to)?\s*(?:floor|level)\s*([1-6])\b/i);
  if (floorMatch) {
    const flNum = Number(floorMatch[1]);
    return {
      answer: `Switched map to Level ${flNum}.`,
      suggestedAction: 'switch_floor',
      suggestedFloor: flNum,
    };
  }

  // Intent: User states their current location e.g. "I'm standing near E5 2108" or "I am at 2108"
  const standingNear = text.match(/\b(?:standing near|standing at|i am at|i'm at|standing outside)\s*(?:e5[\s-]*)?(\d{4}[a-z]?)\b/i);
  if (standingNear) {
    const n = standingNear[1].toUpperCase();
    for (const p of plans) {
      const r = p.rooms.find((x) => (x.roomNumber || '').toUpperCase() === n);
      if (r) {
        const room = withFloor(r, p);
        return {
          answer: `Position updated: Standing near E5 ${room.roomNumber || room.name} on Level ${room.floor}.`,
          room,
          suggestedAction: 'set_start',
        };
      }
    }
  }

  // Intent: Direct Room Search or "Take me to room 3101"
  const num = text.match(/\b(?:take me to|navigate to|go to|where is|find)?\s*(?:classroom|room|lab)?\s*(?:e5[\s-]*)?(\d{4}[a-z]?)\b/i);
  if (num) {
    const n = num[1].toUpperCase();
    for (const p of plans) {
      const r = p.rooms.find((x) => (x.roomNumber || '').toUpperCase() === n);
      if (r) {
        const room = withFloor(r, p);
        const verified = r.purposeVerification === 'verified_official_source' || r.purposeVerification === 'web_lookup_user_approved' || r.purposeVerification === 'staff_reported';
        return {
          answer: `E5 ${r.roomNumber} is on Level ${room.floor}: ${r.name}.${r.purpose && verified ? ` ${r.purpose}` : ''}`,
          room,
          sources: verified && r.sourceUrl ? [{ title: 'Source', url: r.sourceUrl }] : undefined,
          suggestedAction: 'navigate',
        };
      }
    }
    return { answer: `I couldn't find room ${n} on this building's map. Check the number or tap 'Update the map' to propose it.` };
  }

  // Food / Vending
  if (FOOD.test(text)) {
    if (!isE5) return { answer: "I don't have verified food information for this building yet." };
    const facts = E5_FACTS.filter((f) => ['food-none-inside', 'vending-6', 'plaza-food'].includes(f.id));
    return {
      answer: 'There is no cafe listed inside E5. Vending machines are on Level 6, and University Plaza next door has multiple dining options.',
      sources: factSources(facts),
    };
  }

  // E3 Bridge / Overpass
  if (/\b(e3|overpass|bridge)\b/i.test(text) && isE5) {
    const f = E5_FACTS.find((x) => x.id === 'e3-overpass')!;
    const bridgeRoom = plans.flatMap((p) => p.rooms.map((r) => withFloor(r, p))).find((r) => r.id === 'e5-3818');
    return {
      answer: `The enclosed pedestrian bridge to Engineering 3 (E3) is accessible on Level 3 (room 3818) across Ring Road.`,
      sources: factSources([f]),
      room: bridgeRoom,
    };
  }

  // Washrooms, Elevators, Stairs, Exits
  for (const it of INTENTS) {
    if (!it.words.test(text)) continue;
    if (!from) {
      // Use building default entrance if no start set
      const defaultStart = plans.flatMap((p) => p.rooms.map((r) => withFloor(r, p))).find((r) => r.category === 'entrance') || plans[0].rooms[0];
      from = defaultStart;
    }
    const best = nearest(it.cats, from, plans, accessible && it.key !== 'stairs');
    if (!best) return { answer: `There is no ${it.label} on this building's map yet.` };
    const where = best.r.floor === from.floor ? 'on this floor' : `on Level ${best.r.floor}`;
    return {
      answer: `The nearest ${it.label} is ${best.r.name}${best.r.roomNumber && !best.r.name.includes(best.r.roomNumber) ? ` (${best.r.roomNumber})` : ''}, ${where}, about ${Math.round(best.m)} m away (~${Math.max(1, Math.round(best.min))} min walk).`,
      room: best.r,
      suggestedAction: 'navigate',
    };
  }

  return null;
}
