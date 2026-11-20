import { describe, expect, it } from 'vitest';
import { stackShares } from '../scripts/campus/auditStacking';
import { bestMove } from '../scripts/campus/stackByShafts';

// Five shafts on a 40 x 30 m floor (metres), not symmetric.
const shafts: [number, number][] = [[0, 0], [12, 3], [30, 5], [7, 25], [38, 28]];
const turn = (p: [number, number], deg: number, c: [number, number]): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [c[0] + (p[0] - c[0]) * Math.cos(r) - (p[1] - c[1]) * Math.sin(r), c[1] + (p[0] - c[0]) * Math.sin(r) + (p[1] - c[1]) * Math.cos(r)];
};

describe('floor stacking by stairs and elevators', () => {
  it('finds the move that puts a shifted floor back on its neighbour', () => {
    const moved = shafts.map(([x, y]): [number, number] => [x - 9, y + 6]);
    const m = bestMove(moved, shafts, [20, 15])!;
    expect(m.inliers).toBe(5);
    expect(Math.abs(m.turnDeg)).toBeLessThanOrEqual(1);
    expect(m.dx).toBeCloseTo(9, 0); expect(m.dy).toBeCloseTo(-6, 0);
  });

  it('finds a floor drawn upside down (half turn)', () => {
    const c: [number, number] = [20, 15];
    const flipped = shafts.map((p) => turn(p, 180, c));
    const m = bestMove(flipped, shafts, c)!;
    expect(m.inliers).toBe(5);
    expect(Math.round(m.turnDeg / 90) * 90 % 360).toBe(180);
  });

  it('audit: share of shafts lined up with the floor above or below', () => {
    const r = stackShares([
      { id: 'a1', building: 'A', floor: 1, shafts },
      { id: 'a2', building: 'A', floor: 2, shafts: shafts.map(([x, y]): [number, number] => [x + 0.00001, y]) },
      { id: 'a3', building: 'A', floor: 3, shafts: shafts.map(([x, y]): [number, number] => [x + 0.01, y]) }, // ~800 m off
    ]);
    expect(r.find((x) => x.id === 'a1')!.share).toBe(1);
    expect(r.find((x) => x.id === 'a3')!.share).toBe(0);
  });
});
