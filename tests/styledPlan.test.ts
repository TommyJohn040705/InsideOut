import { describe, expect, it } from 'vitest';
import { buildingCells, regionFills, ROOM_FILL, CORRIDOR_FILL } from '../src/campus/styledPlan';

describe('styled floor pictures', () => {
  it('keeps the building that holds the room labels, not the frame or a bigger key map', () => {
    const W = 400, H = 300, walls = new Uint8Array(W * H);
    const box = (x0: number, y0: number, x1: number, y1: number) => { for (let x = x0; x <= x1; x++) { walls[y0 * W + x] = 1; walls[y1 * W + x] = 1; } for (let y = y0; y <= y1; y++) { walls[y * W + x0] = 1; walls[y * W + x1] = 1; } };
    box(0, 0, W - 1, H - 1); // sheet frame
    box(40, 40, 140, 140); // building
    box(200, 60, 380, 280); // key map, larger than the building
    const inside = buildingCells(walls, W, H, W / 4, H / 4, 4, [{ x: 20, y: 25 }, { x: 25, y: 35 }]);
    const at = (x: number, y: number) => inside[Math.floor(y / 4) * (W / 4) + Math.floor(x / 4)];
    expect(at(90, 90)).toBe(1);
    expect(at(290, 170)).toBe(0);
    expect(at(10, 290)).toBe(0);
  });

  it('colours a space by its room label, and a corridor label wins', () => {
    const region = new Int32Array([0, 0, 1, 1]);
    const fills = regionFills(region, 4, 1, [{ coords: { x: 10, y: 50 }, category: 'restroom' }, { coords: { x: 60, y: 50 }, category: 'office' }, { coords: { x: 90, y: 50 }, category: 'corridor' }]);
    expect(fills).toEqual([ROOM_FILL.restroom, CORRIDOR_FILL]);
  });
});
