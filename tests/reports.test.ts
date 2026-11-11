import { describe, expect, it } from 'vitest';
import { E5_FLOORS, E5_VERTICAL_LINKS } from '../src/data/e5/e5DataLoader';
import { calculateIndoorRoute } from '../src/utils/pathfinding';
import { RoomReport, routeClosures, REPORT_TTL_MS } from '../src/utils/reports';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const report = (roomId: string, type: string, confirmations: number, ageMs = 0): RoomReport => ({
  id: `${roomId}-${type}`, roomId, roomLabel: roomId, floor: null, type, details: '', confirmations,
  createdAt: new Date(NOW - ageMs).toISOString(),
});
const room = (n: string) => {
  for (const p of E5_FLOORS) { const r = p.rooms.find((x) => x.roomNumber === n); if (r) return { ...r, floor: p.floorNumber, plan: p }; }
  throw new Error(n);
};
const route = (from: string, to: string, accessible: boolean, reports: RoomReport[]) => {
  const a = room(from), b = room(to);
  return calculateIndoorRoute(a.plan, a.coords, a.name, b.coords, b.name, a.id, b.id, {
    isAccessibleOnly: accessible, allFloors: E5_FLOORS, startFloor: a.floor, endFloor: b.floor,
    closures: routeClosures(reports, E5_FLOORS, E5_VERTICAL_LINKS, NOW),
  });
};

describe('report closures', () => {
  it('a single report only warns; a confirmed one closes the shaft; an old one lapses', () => {
    const c = (n: number, age = 0) => routeClosures([report('e5-3801', 'elevator_out', n, age)], E5_FLOORS, E5_VERTICAL_LINKS, NOW);
    expect([...c(1).linkIds]).toEqual([]);
    expect([...c(1).unconfirmedLinkIds]).toEqual(['v-link-elevators']);
    expect([...c(2).linkIds]).toEqual(['v-link-elevators']);
    expect(c(2, REPORT_TTL_MS + 1).linkIds.size).toBe(0);
  });

  it('the second elevator car maps to the same bank', () => {
    expect([...routeClosures([report('e5-3802', 'elevator_out', 2)], E5_FLOORS, E5_VERTICAL_LINKS, NOW).linkIds]).toEqual(['v-link-elevators']);
  });

  it('step-free route says so when the only elevator is out, instead of pretending', () => {
    const r = route('2811', '3101', true, [report('e5-3801', 'elevator_out', 2)]);
    expect(r.flaggedNotes?.[0]).toMatch(/out of service and no other step-free way/);
  });

  it('a closed stairwell is avoided when stairs are allowed', () => {
    const open = route('2811', '3101', false, []);
    const via = (r: typeof open) => r.steps.find((x: any) => x.isVerticalTransition)?.floorChange?.via;
    expect(via(open)).toContain('Stair E');
    const closed = route('2811', '3101', false, [report('e5-3808', 'hallway_blocked', 2)]);
    expect(via(closed)).not.toContain('Stair E');
    expect(closed.flaggedNotes?.[0]).toMatch(/reported closed/);
  });

  it('a confirmed blocked hallway changes the route or is reported as unavoidable', () => {
    const before = route('3101', '3002', true, []);
    const after = route('3101', '3002', true, [report('e5-3812A', 'hallway_blocked', 2)]);
    expect(after.flaggedNotes?.[0]).toMatch(/Rerouted|no other way around/);
    if (/Rerouted/.test(after.flaggedNotes![0])) expect(after.totalDistanceMeters).toBeGreaterThanOrEqual(before.totalDistanceMeters);
  });
});
