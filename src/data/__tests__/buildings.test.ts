import { describe, expect, it } from 'vitest';
import { createDefaultBuildings } from '../buildings';
import { findRoute } from '../../lib/routing';
import { validateBuilding } from '../../lib/editor';

describe('default buildings (InsideOut demo + FloorNav samples)', () => {
  const buildings = createDefaultBuildings();

  it('includes the demo hall and the three FloorNav samples', () => {
    expect(buildings.map((b) => b.name)).toEqual(['Demo Hall', 'Helix Innovation Hub', 'Mercy Medical Pavilion', 'Skyline Terminal B']);
    for (const b of buildings) expect(validateBuilding(b), b.name).toBe(true);
  });

  it('every place is reachable from every other place in every sample (no straight-line fallbacks)', () => {
    for (const b of buildings.slice(1)) {
      const places = b.nodes.filter((n) => n.kind !== 'corridor');
      let pairs = 0;
      for (const a of places) {
        for (const c of places) {
          if (a.id === c.id) continue;
          const r = findRoute(b, { fromId: a.id, toId: c.id, options: { accessible: false } });
          expect(r.ok, `${b.name}: ${a.label} -> ${c.label}`).toBe(true);
          pairs++;
        }
      }
      expect(pairs).toBeGreaterThan(40);
    }
  });

  it('fixes the unconnected Breakout Lounge from the FloorNav Helix data', () => {
    const helix = buildings.find((b) => b.name === 'Helix Innovation Hub')!;
    const lounge = helix.nodes.find((n) => /Breakout/.test(n.label ?? ''))!;
    expect(helix.edges.some((e) => e.from === lounge.id || e.to === lounge.id)).toBe(true);
  });

  it('keeps FloorNav metadata: floor image, categories, floor name', () => {
    const helix = buildings[1];
    expect(helix.floors[0].imageUrl).toMatch(/^data:image\/svg\+xml/);
    expect(helix.floors[0].name).toBe('Floor 2');
    expect(helix.nodes.some((n) => n.category === 'restroom')).toBe(true);
    expect(helix.description).toMatch(/Corporate technology office/);
  });
});
