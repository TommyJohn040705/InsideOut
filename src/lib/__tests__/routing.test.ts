import { describe, expect, it } from 'vitest';
import { createSampleBuilding } from '../../data/sampleBuilding';
import { edgeCost, findRoute, searchPlaces } from '../routing';
import { blockedEdgeIds, clearReport, confirmReport, createReport, isReportActive } from '../reports';
import type { Building } from '../types';

const building = createSampleBuilding();
const edgeKinds = (b: Building, ids: string[]) => ids.map((id) => b.edges.find((e) => e.id === id)!.kind);

describe('sample building', () => {
  it('has consistent edges', () => {
    const ids = new Set(building.nodes.map((n) => n.id));
    for (const e of building.edges) {
      expect(ids.has(e.from), e.id).toBe(true);
      expect(ids.has(e.to), e.id).toBe(true);
    }
    expect(new Set(building.edges.map((e) => e.id)).size).toBe(building.edges.length);
  });
});

describe('findRoute', () => {
  it('routes between two rooms on the same floor', () => {
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f1-N-50', options: { accessible: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.nodeIds[0]).toBe('f1-N-10');
    expect(r.route.nodeIds.at(-1)).toBe('f1-N-50');
    // 6 m out of room + 40 m along the north corridor + 6 m into room.
    expect(r.route.distance).toBeCloseTo(52, 5);
    expect(edgeKinds(building, r.route.edgeIds).every((k) => k === 'walkway')).toBe(true);
  });

  it('never walks through another room', () => {
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f1-S-50', options: { accessible: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inner = r.route.nodeIds.slice(1, -1);
    for (const id of inner) expect(building.nodes.find((n) => n.id === id)!.kind).not.toBe('room');
  });

  it('changes floors and gives step-by-step instructions', () => {
    const r = findRoute(building, { fromId: 'f1-S-30', toId: 'f3-N-30', options: { accessible: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const floors = new Set(r.route.nodeIds.map((id) => building.nodes.find((n) => n.id === id)!.floorId));
    expect(floors.has('f1') && floors.has('f3')).toBe(true);
    expect(r.route.steps[0].instruction).toMatch(/Start at Main Entrance/);
    expect(r.route.steps.at(-1)!.instruction).toBe('Arrive at Lecture Hall 301.');
    expect(r.route.steps.some((s) => /Take the (elevator|stairs) to Floor 3/.test(s.instruction))).toBe(true);
  });

  it('accessible routes never use stairs', () => {
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f3-N-10', options: { accessible: true } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kinds = edgeKinds(building, r.route.edgeIds);
    expect(kinds).not.toContain('stairs');
    expect(kinds).toContain('elevator');
  });

  it('non-accessible routes may prefer stairs when shorter', () => {
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f2-N-10', options: { accessible: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(edgeKinds(building, r.route.edgeIds)).toContain('stairs');
  });

  it('reroutes around a blocked corridor', () => {
    const base = findRoute(building, { fromId: 'f1-N-10', toId: 'f1-N-50', options: { accessible: false } });
    expect(base.ok).toBe(true);
    const report = createReport('blocked-corridor', 'f1-N30__f1-N40');
    const blocked = blockedEdgeIds(building, [report]);
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f1-N-50', options: { accessible: false }, blockedEdges: blocked });
    expect(r.ok).toBe(true);
    if (!r.ok || !base.ok) return;
    expect(r.route.edgeIds).not.toContain('f1-N30__f1-N40');
    expect(r.route.distance).toBeGreaterThan(base.route.distance);
  });

  it('reports no step-free route when the only elevator is out', () => {
    const report = createReport('elevator-out', 'elevator-main');
    const blocked = blockedEdgeIds(building, [report]);
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f2-N-10', options: { accessible: true }, blockedEdges: blocked });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/step-free/);
    // Without accessibility needs the stairs still work.
    const r2 = findRoute(building, { fromId: 'f1-N-10', toId: 'f2-N-10', options: { accessible: false }, blockedEdges: blocked });
    expect(r2.ok).toBe(true);
  });

  it('handles unknown nodes and same start/end', () => {
    expect(findRoute(building, { fromId: 'nope', toId: 'f1-N-10', options: { accessible: false } }).ok).toBe(false);
    const same = findRoute(building, { fromId: 'f1-N-10', toId: 'f1-N-10', options: { accessible: false } });
    expect(same.ok && same.route.distance === 0).toBe(true);
  });
});

/** Reference Dijkstra used to check that A* returns optimal costs. */
function dijkstraCost(b: Building, from: string, to: string, accessible: boolean, blocked = new Set<string>()): number {
  const levels = new Map(b.floors.map((f) => [f.id, f.level]));
  const nodes = new Map(b.nodes.map((n) => [n.id, n]));
  const dist = new Map<string, number>([[from, 0]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | undefined;
    let best = Infinity;
    for (const [k, d] of dist) {
      if (!done.has(k) && d < best) {
        best = d;
        cur = k;
      }
    }
    if (cur === undefined) return Infinity;
    if (cur === to) return best;
    done.add(cur);
    for (const e of b.edges) {
      if (blocked.has(e.id) || (accessible && e.kind === 'stairs')) continue;
      const other = e.from === cur ? e.to : e.to === cur ? e.from : null;
      if (!other) continue;
      const on = nodes.get(other)!;
      if (on.kind === 'room' && other !== to) continue;
      const nd = best + edgeCost(e, nodes.get(cur)!, on, levels);
      if (nd < (dist.get(other) ?? Infinity)) dist.set(other, nd);
    }
  }
}

describe('A* optimality', () => {
  const places = building.nodes.filter((n) => n.kind !== 'corridor').map((n) => n.id);
  const blocked = blockedEdgeIds(building, [createReport('blocked-corridor', 'f2-S20__f2-S30'), createReport('stairs-closed', 'stairs-east')]);
  it('matches Dijkstra on every room pair sample, with and without blocks', () => {
    let checked = 0;
    for (let i = 0; i < places.length; i += 3) {
      for (let j = 1; j < places.length; j += 4) {
        for (const accessible of [false, true]) {
          for (const bl of [new Set<string>(), blocked]) {
            const r = findRoute(building, { fromId: places[i], toId: places[j], options: { accessible }, blockedEdges: bl });
            const ref = dijkstraCost(building, places[i], places[j], accessible, bl);
            if (ref === Infinity) expect(r.ok).toBe(false);
            else {
              expect(r.ok).toBe(true);
              if (r.ok) expect(r.route.distance).toBeCloseTo(ref, 6);
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('expands fewer nodes than the whole graph for a same-floor trip', () => {
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f1-N-20', options: { accessible: false } });
    expect(r.ok && r.route.expanded! < building.nodes.length / 4).toBe(true);
  });
});

describe('stairwell closures', () => {
  it('closing a stairwell removes it from every floor', () => {
    const blocked = blockedEdgeIds(building, [createReport('stairs-closed', 'stairs-west')]);
    const r = findRoute(building, { fromId: 'f1-N-10', toId: 'f2-N-10', options: { accessible: false }, blockedEdges: blocked });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.edgeIds.some((id) => id.includes('stW'))).toBe(false);
  });
});

describe('reports lifecycle', () => {
  it('expires, can be confirmed and cleared', () => {
    const t0 = 1_000_000;
    const r = createReport('blocked-corridor', 'x', 'wet floor', t0);
    expect(isReportActive(r, t0)).toBe(true);
    expect(isReportActive(r, r.expiresAt + 1)).toBe(false);
    const confirmed = confirmReport(r, t0);
    expect(confirmed.confirmations).toBe(2);
    expect(confirmed.expiresAt).toBeGreaterThan(r.expiresAt);
    expect(isReportActive(clearReport(r), t0)).toBe(false);
    expect(isReportActive(clearReport(confirmed), t0)).toBe(true);
  });

  it('ignores inactive reports when blocking edges', () => {
    const r = clearReport(createReport('blocked-corridor', 'f1-N30__f1-N40'));
    expect(blockedEdgeIds(building, [r]).size).toBe(0);
  });
});

describe('searchPlaces', () => {
  it('finds rooms by number, name and alias', () => {
    expect(searchPlaces(building, '205')[0].label).toBe('Room 205');
    expect(searchPlaces(building, 'library')[0].label).toBe('Library');
    expect(searchPlaces(building, 'bathroom').length).toBe(3);
    expect(searchPlaces(building, '')).toEqual([]);
  });
});
