import { draftToFloor, floorNavToDraft } from '../lib/floorPlanImport';
import type { FloorNavPlan } from '../shared/gemini';
import type { Building } from '../lib/types';
import { FLOORNAV_SAMPLES } from './floorNavSamples';
import { createSampleBuilding } from './sampleBuilding';

/** FloorNav sample images are 750 x 780 SVGs. */
const SAMPLE_ASPECT = 780 / 750;

/**
 * Converts a single-floor FloorNav plan into an InsideOut building, using the
 * same adapter as AI imports. Rooms the FloorNav data left unconnected (e.g.
 * Helix "Breakout Lounge") are joined to their nearest corridor.
 */
export function floorNavToBuilding(plan: FloorNavPlan, id: string): Building {
  const [floorLabel, ...rest] = (plan.buildingType ?? '').split('·').map((s) => s.trim());
  const levelMatch = floorLabel?.match(/(\d+)/);
  const widthMatch = plan.scaleNote?.match(/total\s+(\d+)\s*m/i);
  const empty: Building = { id, name: plan.title, floors: [], nodes: [], edges: [] };
  const part = draftToFloor(floorNavToDraft(plan), empty, {
    floorId: `${id}-f1`,
    floorName: floorLabel || 'Floor 1',
    level: levelMatch ? Number(levelMatch[1]) : 1,
    widthMetres: widthMatch ? Number(widthMatch[1]) : 70,
    aspectRatio: SAMPLE_ASPECT,
    imageUrl: plan.imageUrl,
  });
  return {
    id,
    name: plan.title,
    description: [rest.join(' - '), plan.summary].filter(Boolean).join('. '),
    floors: [part.floor],
    nodes: part.nodes,
    edges: part.edges,
  };
}

export function createDefaultBuildings(): Building[] {
  const ids = ['helix-hub', 'mercy-pavilion', 'skyline-terminal'];
  return [createSampleBuilding(), ...FLOORNAV_SAMPLES.map((p, i) => floorNavToBuilding(p, ids[i] ?? `sample-${i}`))];
}
