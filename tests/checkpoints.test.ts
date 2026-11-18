import { expect, it } from 'vitest';
import { E5_CHECKPOINTS, resolveCheckpoint } from '../src/data/e5/checkpoints';
import { SAMPLE_FLOOR_PLANS } from '../src/data/sampleFloorPlans';

it('every E5 checkpoint points at a real room on its floor and none claims to be official', () => {
  const rooms = SAMPLE_FLOOR_PLANS.flatMap((p) => p.rooms.map((r) => ({ ...r, floor: r.floor ?? p.floorNumber })));
  for (const c of E5_CHECKPOINTS) {
    const r = rooms.find((x) => x.id === c.roomId);
    expect(r, c.code).toBeTruthy();
    expect(r!.floor).toBe(c.floor);
    expect(c.verifiedOfficial).toBe(false);
  }
  expect(resolveCheckpoint('qr: e5-l2-atrium')?.code).toBe('E5-L2-ATRIUM');
});
