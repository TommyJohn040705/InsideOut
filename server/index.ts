/**
 * InsideOut server. Keeps the Gemini API key on the server (adapted from the
 * FloorNav prototype's server.ts) and serves the app.
 *
 *   npm run dev     -> Vite dev middleware + API on http://localhost:3000
 *   npm start       -> serves the production build in dist/ + API
 *
 * Environment (.env or .env.local): GEMINI_API_KEY, optional GEMINI_MODEL, PORT.
 */
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_GEMINI_MODEL,
  FLOOR_PLAN_SCHEMA,
  WAYFINDER_SCHEMA,
  floorPlanPrompt,
  geminiJson,
  splitDataUrl,
  wayfinderPrompt,
  type DirectoryEntry,
} from '../src/shared/gemini';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const apiKey = () => process.env.GEMINI_API_KEY?.trim() || '';
const model = () => process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

export const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, gemini: Boolean(apiKey()), model: model() });
});

function requireKey(res: Response): boolean {
  if (apiKey()) return true;
  res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server. Add it to .env.local, or paste a key in the app.' });
  return false;
}

app.post('/api/analyze-floorplan', async (req: Request, res: Response) => {
  if (!requireKey(res)) return;
  const { image, buildingTypeHint } = req.body ?? {};
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'An image data URL is required.' });
  }
  try {
    const { mimeType, data } = splitDataUrl(image);
    const plan = await geminiJson<Record<string, unknown>>({
      apiKey: apiKey(),
      model: model(),
      parts: [{ inline_data: { mime_type: mimeType, data } }, { text: floorPlanPrompt(typeof buildingTypeHint === 'string' ? buildingTypeHint.slice(0, 100) : undefined) }],
      schema: FLOOR_PLAN_SCHEMA,
    });
    res.json(plan);
  } catch (e) {
    console.error('analyze-floorplan failed:', e);
    res.status(502).json({ error: e instanceof Error ? e.message : 'Floor plan analysis failed.' });
  }
});

app.post('/api/ask-wayfinder', async (req: Request, res: Response) => {
  if (!requireKey(res)) return;
  const { buildingName, directory, question, current } = req.body ?? {};
  if (typeof question !== 'string' || !question.trim() || !Array.isArray(directory)) {
    return res.status(400).json({ error: 'question and directory are required.' });
  }
  try {
    const dir = (directory as DirectoryEntry[]).slice(0, 500);
    const out = await geminiJson<{ answer: string; suggestedDestinationId?: string }>({
      apiKey: apiKey(),
      model: model(),
      parts: [{ text: wayfinderPrompt(String(buildingName ?? 'this building'), dir, question.slice(0, 500), typeof current === 'string' ? current : undefined) }],
      schema: WAYFINDER_SCHEMA,
    });
    res.json(out);
  } catch (e) {
    console.error('ask-wayfinder failed:', e);
    res.status(502).json({ error: e instanceof Error ? e.message : 'Assistant request failed.' });
  }
});

async function start() {
  if (isProduction) {
    const dist = path.join(root, 'dist');
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InsideOut running on http://localhost:${PORT} (Gemini ${apiKey() ? `enabled, ${model()}` : 'not configured'})`);
  });
}

if (process.env.INSIDEOUT_NO_LISTEN !== '1') start();
