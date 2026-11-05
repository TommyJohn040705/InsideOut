import { describe, expect, it, vi } from 'vitest';
import { createSampleBuilding } from '../../data/sampleBuilding';
import { analyseFloorPlan, draftToFloor, floorNavToDraft, listShafts, parseDraft, SAMPLE_DRAFT_JSON } from '../floorPlanImport';
import { findRoute } from '../routing';
import type { Building } from '../types';

const merge = (b: Building, part: ReturnType<typeof draftToFloor>): Building => ({
  ...b,
  floors: [...b.floors, part.floor],
  nodes: [...b.nodes, ...part.nodes],
  edges: [...b.edges, ...part.edges],
});

function connected(nodes: { id: string }[], edges: { from: string; to: string }[]): boolean {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const seen = new Set([nodes[0].id]);
  const stack = [nodes[0].id];
  while (stack.length) {
    for (const m of adj.get(stack.pop()!)!) {
      if (!seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return nodes.every((n) => seen.has(n.id));
}

describe('parseDraft (FloorNav format from Gemini)', () => {
  it('parses rooms, corridors, stairs and elevators', () => {
    const d = parseDraft(SAMPLE_DRAFT_JSON);
    expect(d.title).toBe('Sample Wing');
    expect(d.rooms).toHaveLength(6);
    expect(d.walkways).toHaveLength(7);
    expect(d.connectors.filter((c) => c.kind === 'stairs')).toHaveLength(2);
    expect(d.connectors.filter((c) => c.kind === 'elevator')).toHaveLength(1);
    const r402 = d.rooms.find((r) => r.label === 'Room 402')!;
    expect(r402.category).toBe('classroom');
    expect(r402.anchor).toEqual([500, 300]);
    expect(r402.linkTo).toEqual([[500, 500]]);
  });

  it('drops invalid items, maps unknown categories to other, and keeps isolated hallways', () => {
    const d = floorNavToDraft({
      title: 't',
      rooms: [
        { id: 'a', name: 'A', category: 'spaceship', coords: { x: 10, y: 10 } },
        { id: 'b', name: 'B', category: 'office', coords: { x: 'bad' as unknown as number, y: 1 } },
      ],
      hallways: [{ id: 'h1', coords: { x: 20, y: 20 }, connectedTo: ['a', 'missing'] }],
    });
    expect(d.rooms).toHaveLength(1);
    expect(d.rooms[0].category).toBe('other');
    expect(d.rooms[0].linkTo).toEqual([[200, 200]]);
    expect(d.walkways).toHaveLength(1);
  });

  it('still accepts the simple InsideOut format with code fences', () => {
    const text = '```json\n' + JSON.stringify({
      rooms: [{ label: 'A', x: 10, y: 10, width: 50, height: 50 }, { label: 'bad', x: 'nope' }, { x: 990, y: 0, width: 100, height: 10 }],
      walkways: [{ points: [[0, 0], [2000, -5]] }, { points: [[1, 1]] }],
    }) + '\n```';
    const d = parseDraft(text);
    expect(d.rooms).toHaveLength(2);
    expect(d.rooms[1].label).toBe('Room 3');
    expect(d.rooms[1].width).toBe(10);
    expect(d.walkways).toHaveLength(1);
    expect(d.walkways[0].points[1]).toEqual([1000, 0]);
  });

  it('rejects empty or non-JSON responses', () => {
    expect(() => parseDraft('sorry, I cannot help')).toThrow();
    expect(() => parseDraft('{"rooms": [], "hallways": []}')).toThrow(/No rooms/);
  });
});

describe('draftToFloor', () => {
  it('creates a routable floor linked to existing shafts, skipping rejected items', () => {
    const building = createSampleBuilding();
    const draft = parseDraft(SAMPLE_DRAFT_JSON);
    draft.rooms.find((r) => r.label === 'Office 405')!.accepted = false;
    draft.connectors.find((c) => c.kind === 'elevator')!.linkShaftId = 'elevator-main';

    const out = draftToFloor(draft, building, { floorName: 'Floor 4', level: 4, widthMetres: 60, aspectRatio: 0.5 });
    expect(out.floor.rooms).toHaveLength(5);
    expect(out.nodes.some((n) => n.label === 'Office 405')).toBe(false);
    expect(out.nodes.find((n) => n.label === 'Washrooms')!.category).toBe('restroom');

    const merged = merge(building, out);
    const target = out.nodes.find((n) => n.label === 'Room 402')!;
    const r = findRoute(merged, { fromId: 'f3-N-10', toId: target.id, options: { accessible: true } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.steps.some((s) => s.instruction === 'Take the elevator to Floor 4.')).toBe(true);
  });

  it('produces one connected network from the AI hallway graph', () => {
    const out = draftToFloor(parseDraft(SAMPLE_DRAFT_JSON), createSampleBuilding(), { floorName: 'F4', level: 4, widthMetres: 60, aspectRatio: 0.5 });
    expect(out.nodes.filter((n) => n.kind === 'corridor')).toHaveLength(8);
    expect(connected(out.nodes, out.edges)).toBe(true);
  });

  it('joins T junctions in hand-drawn walkways', () => {
    const draft = parseDraft(JSON.stringify({
      rooms: [{ label: 'R', x: 100, y: 100, width: 100, height: 100 }],
      walkways: [{ points: [[0, 500], [1000, 500]] }, { points: [[500, 500], [500, 100]] }, { points: [[250, 500], [250, 900]] }],
    }));
    const out = draftToFloor(draft, createSampleBuilding(), { floorName: 'F', level: 9, widthMetres: 50, aspectRatio: 1 });
    expect(connected(out.nodes, out.edges)).toBe(true);
  });
});

describe('listShafts', () => {
  it('lists distinct shafts', () => {
    const b = createSampleBuilding();
    expect(listShafts(b, 'elevator')).toEqual([{ shaftId: 'elevator-main', label: 'Elevator' }]);
    expect(listShafts(b, 'stairs').map((s) => s.shaftId).sort()).toEqual(['stairs-east', 'stairs-west']);
  });
});

describe('analyseFloorPlan', () => {
  const image = 'data:image/png;base64,AQID';

  it('calls Gemini directly when the user supplies a key', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: SAMPLE_DRAFT_JSON }] } }] }), { status: 200 }),
    );
    const draft = await analyseFloorPlan(image, { apiKey: 'test-key', fetchImpl: fetchMock as unknown as typeof fetch });
    expect(draft.rooms).toHaveLength(6);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(':generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'image/png', data: 'AQID' });
    expect(body.generationConfig.responseSchema).toBeTruthy();
  });

  it('uses the InsideOut server when no key is given', async () => {
    const fetchMock = vi.fn(async () => new Response(SAMPLE_DRAFT_JSON, { status: 200 }));
    const draft = await analyseFloorPlan(image, { buildingTypeHint: 'University', fetchImpl: fetchMock as unknown as typeof fetch });
    expect(draft.connectors).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/analyze-floorplan');
    expect(JSON.parse(init.body as string)).toEqual({ image, buildingTypeHint: 'University' });
  });

  it('surfaces API and server errors', async () => {
    const quota = vi.fn(async () => new Response('quota exceeded', { status: 429 }));
    await expect(analyseFloorPlan(image, { apiKey: 'k', fetchImpl: quota as unknown as typeof fetch })).rejects.toThrow(/429/);
    const noKey = vi.fn(async () => new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not set on the server.' }), { status: 503 }));
    await expect(analyseFloorPlan(image, { fetchImpl: noKey as unknown as typeof fetch })).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
