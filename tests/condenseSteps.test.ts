import { describe, expect, it } from 'vitest';
import { condenseSteps } from '../src/utils/condenseSteps';
import type { NavigationStep } from '../src/types/navigation';

let cum = 0;
const st = (action: NavigationStep['action'], instruction: string, d = 0, extra: Partial<NavigationStep> = {}): NavigationStep => {
  cum += d;
  return { stepNumber: 0, instruction, coords: { x: 0, y: 0 }, floor: 1, distanceMeters: d, cumulativeDistanceMeters: cum, action, ...extra };
};

describe('plain steps', () => {
  cum = 0;
  const steps = [
    st('start', 'Start at East Entrance 1816 (Level 1).'),
    st('turn-left', 'Turn left at the corridor junction for ~1m.', 1),
    st('slight-left', 'Bear slightly left down the corridor (near Washroom 1912) for ~3m.', 3),
    st('straight', 'Continue straight for ~6m.', 6),
    st('turn-right', 'Turn right at the corridor junction (near Elevator 2 (Southeast Bank)) for ~16m.', 2),
    st('arrive', 'Arrive at Elevator 1 (Southeast Bank).', 16),
    st('take-elevator', 'Take the elevator up 2 floors to Level 3 (Wheelchair Accessible).', 0, { isVerticalTransition: true }),
    st('start', 'Start at Elevator 1 (Level 3).'),
    st('turn-left', 'Turn left (near Room 3902) for ~40m.', 1),
    st('arrive', 'Arrive at Room 3101. Destination is directly ahead.', 40),
  ];
  const plain = condenseSteps(steps);

  it('keeps the start, real turns, the elevator and the arrival only', () => {
    expect(plain.map((p) => p.step.action)).toEqual(['start', 'turn-left', 'turn-right', 'take-elevator', 'turn-left', 'arrive']);
  });

  it('folds small wiggles into "walk about N m" and keeps bracketed landmarks whole', () => {
    expect(plain[1].text).toBe('Turn left, then walk about 10 m.');
    expect(plain[2].text).toBe('Turn right by Elevator 2 (Southeast Bank), then walk about 15 m.');
    expect(plain[3].text).toBe('Take the elevator up 2 floors to Level 3.');
    expect(plain[5].text).toBe('Arrive at Room 3101.');
  });

  it('remembers which router step each plain step came from', () => {
    expect(plain.map((p) => p.index)).toEqual([0, 1, 4, 6, 8, 9]);
  });
});
