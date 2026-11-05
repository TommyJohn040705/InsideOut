// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { SAMPLE_DRAFT_JSON } from '../../src/lib/floorPlanImport';
import type { Express } from 'express';

let app: Express;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  process.env.INSIDEOUT_NO_LISTEN = '1';
  ({ app } = await import('../index'));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
});

const geminiReply = (text: string) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }));

describe('server API', () => {
  it('reports health and whether Gemini is configured', async () => {
    expect((await request(app).get('/api/health')).body.gemini).toBe(false);
    process.env.GEMINI_API_KEY = 'k';
    expect((await request(app).get('/api/health')).body.gemini).toBe(true);
  });

  it('serves the public Firebase web config only when provided', async () => {
    expect((await request(app).get('/api/firebase-config')).body).toEqual({ configured: false });
    process.env.FIREBASE_WEBAPP_CONFIG = JSON.stringify({ apiKey: 'web-key', projectId: 'insideout-uw', appId: '1:2:web:3', authDomain: 'x' });
    const res = await request(app).get('/api/firebase-config');
    delete process.env.FIREBASE_WEBAPP_CONFIG;
    expect(res.body).toEqual({ apiKey: 'web-key', projectId: 'insideout-uw', appId: '1:2:web:3', authDomain: 'x' });
  });

  it('returns 503 without a key', async () => {
    const res = await request(app).post('/api/analyze-floorplan').send({ image: 'data:image/png;base64,AA==' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it('validates input', async () => {
    process.env.GEMINI_API_KEY = 'k';
    expect((await request(app).post('/api/analyze-floorplan').send({ image: 'not-an-image' })).status).toBe(400);
    expect((await request(app).post('/api/ask-wayfinder').send({ question: '' })).status).toBe(400);
  });

  it('proxies floor plan analysis to Gemini with the server key', async () => {
    process.env.GEMINI_API_KEY = 'server-key';
    const mock = geminiReply(SAMPLE_DRAFT_JSON);
    globalThis.fetch = mock as unknown as typeof fetch;
    const res = await request(app).post('/api/analyze-floorplan').send({ image: 'data:image/jpeg;base64,AQID', buildingTypeHint: 'University' });
    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(9);
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('server-key');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('image/jpeg');
    expect(body.contents[0].parts[1].text).toContain('University');
  });

  it('rate-limits AI routes per IP', async () => {
    const { createApp } = await import('../app');
    const limited = createApp({ getApiKey: () => 'k', limits: { analyze: 2, ask: 2, windowMs: 60_000 } });
    globalThis.fetch = geminiReply(JSON.stringify({ answer: 'ok' })) as unknown as typeof fetch;
    const ask = () => request(limited).post('/api/ask-wayfinder').send({ directory: [], question: 'x' });
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    const third = await ask();
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeTruthy();
  });

  it('rejects unsupported image types such as SVG', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const res = await request(app).post('/api/analyze-floorplan').send({ image: 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect(res.status).toBe(400);
  });

  it('answers wayfinder questions and surfaces upstream errors', async () => {
    process.env.GEMINI_API_KEY = 'k';
    globalThis.fetch = geminiReply(JSON.stringify({ answer: 'Go to the library.', suggestedDestinationId: 'f2-N-30' })) as unknown as typeof fetch;
    const ok = await request(app).post('/api/ask-wayfinder').send({ buildingName: 'Demo', directory: [{ id: 'f2-N-30', name: 'Library', floor: 'Floor 2' }], question: 'library?' });
    expect(ok.body.suggestedDestinationId).toBe('f2-N-30');

    globalThis.fetch = vi.fn(async () => new Response('bad', { status: 500 })) as unknown as typeof fetch;
    const bad = await request(app).post('/api/ask-wayfinder').send({ directory: [], question: 'x' });
    expect(bad.status).toBe(502);
  });
});
