import { describe, expect, it, vi } from 'vitest';
import { createDefaultBuildings } from '../../data/buildings';
import { answerLocally, askAssistant, buildDirectory } from '../assistant';
import { turnAt } from '../routing';

const [demo, helix] = createDefaultBuildings();

describe('local assistant', () => {
  it('finds the nearest washroom by real route distance', () => {
    const a = answerLocally(demo, 'Where is the nearest washroom?', 'f2-N-10');
    expect(a.destinationId).toBe('f2-wc');
    expect(a.answer).toMatch(/Washrooms on Floor 2/);
  });

  it('handles food, room numbers and unknowns', () => {
    expect(answerLocally(demo, 'where can I get food', 'f3-N-10').destinationId).toBe('f1-N-30');
    expect(answerLocally(demo, 'how do I get to room 205?').destinationId).toBe('f2-N-50');
    expect(answerLocally(demo, 'take me to the library').destinationId).toBe('f2-N-30');
    expect(answerLocally(demo, 'qwerty zzz').destinationId).toBeUndefined();
  });

  it('uses FloorNav categories in the converted samples', () => {
    const lobby = helix.nodes.find((n) => n.category === 'entrance')!;
    const a = answerLocally(helix, 'nearest restroom', lobby.id);
    expect(helix.nodes.find((n) => n.id === a.destinationId)!.category).toBe('restroom');
  });

  it('builds a directory without corridor points', () => {
    const dir = buildDirectory(demo);
    expect(dir.some((d) => d.name === 'Library' && d.floor === 'Floor 2')).toBe(true);
    expect(dir.every((d) => !d.id.match(/-[NS]\d+$/))).toBe(true);
  });
});

describe('askAssistant', () => {
  it('uses Gemini answers but keeps router-chosen nearest destinations', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ answer: 'Head to the washrooms.', suggestedDestinationId: 'f1-wc' }), { status: 200 }));
    const a = await askAssistant(demo, 'nearest washroom', 'f2-N-10', { useAi: true, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(a.source).toBe('gemini');
    expect(a.destinationId).toBe('f2-wc');
  });

  it('falls back to local answers when the server fails or invents ids', async () => {
    const down = vi.fn(async () => new Response('{}', { status: 503 }));
    expect((await askAssistant(demo, 'library', undefined, { useAi: true, fetchImpl: down as unknown as typeof fetch })).source).toBe('local');
    const bogus = vi.fn(async () => new Response(JSON.stringify({ answer: 'It is there.', suggestedDestinationId: 'nope' }), { status: 200 }));
    const a = await askAssistant(demo, 'library', undefined, { useAi: true, fetchImpl: bogus as unknown as typeof fetch });
    expect(a.destinationId).toBe('f2-N-30');
  });
});

describe('turn-by-turn instructions (ported from FloorNav)', () => {
  it('classifies turns in screen coordinates', () => {
    expect(turnAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe('straight');
    expect(turnAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe('turn-right');
    expect(turnAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -10 })).toBe('turn-left');
    expect(turnAt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 5 })).toBe('slight-right');
  });
});
