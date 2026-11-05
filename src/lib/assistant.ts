import { findRoute, searchPlaces } from './routing';
import type { Building, MapNode, PlaceCategory } from './types';
import type { DirectoryEntry } from '../shared/gemini';

/**
 * Wayfinding assistant. Gemini (via the server) answers free-form questions;
 * when the server or key is unavailable, `answerLocally` handles the common
 * questions ("nearest restroom", "where is room 205") using the real router,
 * so the assistant always works and distances are never invented.
 */

export interface AssistantAnswer {
  answer: string;
  destinationId?: string;
  source: 'gemini' | 'local';
}

const CATEGORY_WORDS: Array<{ category: PlaceCategory; words: string[]; noun: string }> = [
  { category: 'restroom', words: ['restroom', 'washroom', 'bathroom', 'toilet', 'wc', 'loo'], noun: 'washroom' },
  { category: 'dining', words: ['food', 'eat', 'cafe', 'cafeteria', 'coffee', 'bistro', 'dining', 'lunch', 'snack'], noun: 'place to eat' },
  { category: 'elevator', words: ['elevator', 'lift'], noun: 'elevator' },
  { category: 'stairs', words: ['stairs', 'stairwell', 'staircase'], noun: 'stairwell' },
  { category: 'exit', words: ['exit', 'way out', 'leave the building'], noun: 'exit' },
  { category: 'entrance', words: ['entrance', 'lobby', 'front door', 'reception'], noun: 'entrance' },
  { category: 'medical', words: ['pharmacy', 'clinic', 'medical', 'doctor', 'nurse', 'emergency'], noun: 'medical area' },
  { category: 'conference', words: ['meeting room', 'conference', 'boardroom'], noun: 'meeting room' },
];

const FILLER = /\b(where('s| is| are)?|how (do|can) i (get|go) to|take me to|directions to|navigate to|find|the|a|an|is|please|nearest|closest|room)\b/gi;

function matchesCategory(n: MapNode, cat: (typeof CATEGORY_WORDS)[number]): boolean {
  if (n.category === cat.category) return true;
  if (cat.category === 'exit' && (n.category === 'entrance' || n.kind === 'entrance')) return true;
  if (cat.category === 'elevator' || cat.category === 'stairs') return n.kind === cat.category;
  const text = [n.label ?? '', ...(n.aliases ?? [])].join(' ').toLowerCase();
  return cat.words.some((w) => new RegExp(`\\b${w}`).test(text));
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

function floorName(b: Building, id: string) {
  return b.floors.find((f) => f.id === id)?.name ?? '';
}

function clean(label?: string) {
  return (label ?? '').replace(/\s*\(Floor [^)]*\)$/, '');
}

export function answerLocally(
  building: Building,
  question: string,
  fromId?: string,
  opts: { accessible?: boolean; blockedEdges?: Set<string> } = {},
): AssistantAnswer {
  const q = question.toLowerCase();
  const cat = CATEGORY_WORDS.find((c) => c.words.some((w) => new RegExp(`\\b${w}`).test(q)));

  if (cat) {
    const here = fromId ? building.nodes.find((n) => n.id === fromId) : undefined;
    const candidates = building.nodes.filter((n) => n.kind !== 'corridor' && n.label && n.id !== fromId && matchesCategory(n, cat));
    if (candidates.length === 0) {
      if (here && matchesCategory(here, cat)) {
        return { answer: `You are already at ${clean(here.label)}, which is the only ${cat.noun} here.`, destinationId: here.id, source: 'local' };
      }
      return { answer: `I could not find ${article(cat.noun)} ${cat.noun} in ${building.name}.`, source: 'local' };
    }
    if (!fromId) {
      const c = candidates[0];
      return {
        answer: `${clean(c.label)} is on ${floorName(building, c.floorId)}. Set a starting point and I will find the nearest one.`,
        destinationId: c.id,
        source: 'local',
      };
    }
    let best: { node: MapNode; distance: number; minutes: number } | undefined;
    for (const c of candidates) {
      const r = findRoute(building, { fromId, toId: c.id, options: { accessible: !!opts.accessible }, blockedEdges: opts.blockedEdges });
      if (r.ok && (!best || r.route.distance < best.distance)) best = { node: c, distance: r.route.distance, minutes: r.route.minutes };
    }
    if (!best) return { answer: `No reachable ${cat.noun} from your current location right now.`, source: 'local' };
    return {
      answer: `The nearest ${cat.noun} is ${clean(best.node.label)} on ${floorName(building, best.node.floorId)}, about ${best.minutes} min away.`,
      destinationId: best.node.id,
      source: 'local',
    };
  }

  const terms = q.replace(/[?.!,]/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const hit = terms ? searchPlaces(building, terms, 1)[0] ?? terms.split(' ').map((t) => searchPlaces(building, t, 1)[0]).find(Boolean) : undefined;
  if (hit) {
    return {
      answer: `${clean(hit.label)} is on ${floorName(building, hit.floorId)}.${hit.description ? ` ${hit.description}` : ''} Tap Route to get directions.`,
      destinationId: hit.id,
      source: 'local',
    };
  }
  return {
    answer: 'Try asking for a room number or name (e.g. "where is 205"), or a facility like "nearest washroom" or "food".',
    source: 'local',
  };
}

export function buildDirectory(building: Building): DirectoryEntry[] {
  return building.nodes
    .filter((n) => n.kind !== 'corridor' && n.label)
    .map((n) => ({ id: n.id, name: clean(n.label), floor: floorName(building, n.floorId), category: n.category ?? n.kind, aliases: n.aliases }));
}

/**
 * Asks the server's Gemini assistant; falls back to the local answer if the
 * server is unreachable, has no key, or suggests an id that does not exist.
 */
export async function askAssistant(
  building: Building,
  question: string,
  fromId?: string,
  opts: { accessible?: boolean; blockedEdges?: Set<string>; useAi?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<AssistantAnswer> {
  const local = answerLocally(building, question, fromId, opts);
  if (!opts.useAi) return local;
  try {
    const from = fromId ? building.nodes.find((n) => n.id === fromId) : undefined;
    const res = await (opts.fetchImpl ?? fetch)('/api/ask-wayfinder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingName: building.name,
        directory: buildDirectory(building),
        question,
        current: from ? `${clean(from.label)} (${floorName(building, from.floorId)})` : undefined,
      }),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as { answer?: string; suggestedDestinationId?: string };
    if (!data.answer) return local;
    const valid = data.suggestedDestinationId && building.nodes.some((n) => n.id === data.suggestedDestinationId);
    // For "nearest X" questions the router's answer is authoritative.
    const destinationId = local.destinationId && /nearest|closest/i.test(question) ? local.destinationId : valid ? data.suggestedDestinationId : local.destinationId;
    return { answer: data.answer, destinationId, source: 'gemini' };
  } catch {
    return local;
  }
}
