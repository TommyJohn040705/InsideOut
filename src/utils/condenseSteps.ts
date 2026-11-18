/**
 * Turn-by-turn steps for people: the router reports every small wiggle of a corridor ("bear slightly
 * left for ~3 m"). Keep the start, real turns, stairs/elevators and arrival, and fold the rest into
 * "walk about N m". Each kept step remembers the router step it came from, for the map.
 */
import type { NavigationStep } from '../types/navigation';

export interface PlainStep { index: number; text: string; step: NavigationStep }

const clean = (s: string) => s.replace(/\s*\(Wheelchair Accessible\)/, '').replace(/ Destination is directly ahead\./, '').replace(/ Head into the corridor\./, '').trim();
// Landmarks can contain brackets: "(near Elevator 2 (Southeast Bank)) for ~3m".
const near = (s: string) => s.match(/\(near (.+?)\)(?= for|\.?\s*$)/)?.[1];
const metres = (m: number) => `about ${Math.max(5, Math.round(m / 5) * 5)} m`;

export function condenseSteps(steps: NavigationStep[]): PlainStep[] {
  const kept: number[] = [];
  steps.forEach((s, i) => {
    const vertical = s.isVerticalTransition || s.action === 'take-elevator' || s.action === 'take-stairs' || s.action === 'cross-bridge';
    // Each floor of a route repeats 'arrive at the elevator' / 'start at the elevator': only the first start and last arrival matter.
    if (i === 0 || (s.action === 'arrive' && i === steps.length - 1) || vertical || s.action === 'turn-left' || s.action === 'turn-right') kept.push(i);
  });
  return kept.map((i, k) => {
    const s = steps[i];
    const next = kept[k + 1];
    const walk = next === undefined ? 0 : (steps[next].cumulativeDistanceMeters ?? 0) - (s.cumulativeDistanceMeters ?? 0);
    const then = walk >= 3 ? `walk ${metres(walk)}` : '';
    const vertical = s.isVerticalTransition || s.action === 'take-elevator' || s.action === 'take-stairs' || s.action === 'cross-bridge';
    let text: string;
    if (s.action === 'turn-left' || s.action === 'turn-right') {
      const by = near(s.instruction);
      text = `Turn ${s.action === 'turn-left' ? 'left' : 'right'}${by ? ` by ${by}` : ''}${then ? `, then ${then}` : ''}.`;
    } else if (vertical || s.action === 'arrive' || i === 0) {
      text = clean(s.instruction).replace(/\.?$/, '.');
      if (then && s.action !== 'arrive') text += ` Then ${then}.`;
    } else {
      text = clean(s.instruction);
    }
    return { index: i, text, step: s };
  });
}
