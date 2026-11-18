import { describe, expect, it } from 'vitest';
import { applyAffine, register, type Mask } from '../src/campus/floorRegister';

// An L-shaped building with a few inner walls, drawn into a w x h mask by a point -> cell function.
function draw(w: number, h: number, place: (x: number, y: number) => [number, number]): Mask {
  const d = new Uint8Array(w * h);
  const segs: [number, number, number, number][] = [[0, 0, 60, 0], [60, 0, 60, 25], [60, 25, 25, 25], [25, 25, 25, 50], [25, 50, 0, 50], [0, 50, 0, 0], [12, 0, 12, 18], [40, 0, 40, 25], [0, 35, 25, 35]];
  for (const [x0, y0, x1, y1] of segs) for (let k = 0; k <= 200; k++) {
    const [x, y] = place(x0 + ((x1 - x0) * k) / 200, y0 + ((y1 - y0) * k) / 200);
    const X = Math.round(x), Y = Math.round(y);
    if (X >= 0 && Y >= 0 && X < w && Y < h) d[Y * w + X] = 1;
  }
  return { w, h, d };
}

describe('register', () => {
  it('finds a quarter turn plus a shift between two floors', () => {
    const ref = draw(120, 100, (x, y) => [20 + x, 20 + y]);
    // The same plan turned 90 degrees clockwise on a portrait sheet, placed elsewhere.
    const moving = draw(100, 120, (x, y) => [70 - y, 15 + x]);
    const r = register(ref, moving)!;
    expect(r.turn).toBe(270);
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.score - r.runnerUp).toBeGreaterThan(0.2);
    // A corner of the plan lands on the same corner of the reference, within a cell.
    const [x, y] = applyAffine(r.m, 70 - 25, 15 + 60);
    expect(Math.hypot(x - (20 + 60), y - (20 + 25))).toBeLessThan(1.5);
  });
});
