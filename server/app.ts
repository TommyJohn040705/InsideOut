/**
 * InsideOut API (Express). Keeps the Gemini API key server-side.
 * Used by server/index.ts (local / Node hosting) and by the Firebase Cloud
 * Function in functions/ (production on Firebase Hosting).
 */
import express, { type NextFunction, type Request, type Response } from 'express';
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

export interface AppOptions {
  /** Read the key at request time so secrets injected after start work. */
  getApiKey?: () => string;
  getModel?: () => string;
  /** Requests per IP per window for each AI route. */
  limits?: { analyze: number; ask: number; windowMs: number };
}

/** Small in-memory sliding-window rate limiter (per instance). */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (now - recent[0])) / 1000));
      return res.status(429).json({ error: 'Too many AI requests. Please wait a minute and try again.' });
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    next();
  };
}

export function createApp(opts: AppOptions = {}) {
  const apiKey = opts.getApiKey ?? (() => process.env.GEMINI_API_KEY?.trim() || '');
  const model = opts.getModel ?? (() => process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
  const limits = opts.limits ?? { analyze: 10, ask: 30, windowMs: 10 * 60 * 1000 };

  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, gemini: Boolean(apiKey()), model: model() });
  });

  // Public Firebase web config (not a secret) for hosts that provide it as an
  // environment variable, e.g. Firebase App Hosting.
  app.get('/api/firebase-config', (_req, res) => {
    try {
      const c = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG ?? '');
      if (c?.apiKey && c?.projectId) {
        return res.json({ apiKey: c.apiKey, projectId: c.projectId, authDomain: c.authDomain, appId: c.appId });
      }
    } catch {
      // fall through
    }
    res.json({ configured: false });
  });

  const requireKey = (_req: Request, res: Response, next: NextFunction) => {
    if (apiKey()) return next();
    res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server. Add it to .env.local, or paste a key in the app.' });
  };

  app.post('/api/analyze-floorplan', requireKey, rateLimit(limits.analyze, limits.windowMs), async (req: Request, res: Response) => {
    const { image, buildingTypeHint } = req.body ?? {};
    if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp|heic|heif);base64,/.test(image)) {
      return res.status(400).json({ error: 'A PNG, JPEG, WebP or HEIC image data URL is required.' });
    }
    try {
      const { mimeType, data } = splitDataUrl(image);
      const plan = await geminiJson<Record<string, unknown>>({
        apiKey: apiKey(),
        model: model(),
        parts: [
          { inline_data: { mime_type: mimeType, data } },
          { text: floorPlanPrompt(typeof buildingTypeHint === 'string' ? buildingTypeHint.slice(0, 100) : undefined) },
        ],
        schema: FLOOR_PLAN_SCHEMA,
      });
      res.json(plan);
    } catch (e) {
      console.error('analyze-floorplan failed:', e instanceof Error ? e.message : e);
      res.status(502).json({ error: e instanceof Error ? e.message : 'Floor plan analysis failed.' });
    }
  });

  app.post('/api/ask-wayfinder', requireKey, rateLimit(limits.ask, limits.windowMs), async (req: Request, res: Response) => {
    const { buildingName, directory, question, current } = req.body ?? {};
    if (typeof question !== 'string' || !question.trim() || !Array.isArray(directory)) {
      return res.status(400).json({ error: 'question and directory are required.' });
    }
    try {
      const out = await geminiJson<{ answer: string; suggestedDestinationId?: string }>({
        apiKey: apiKey(),
        model: model(),
        parts: [
          {
            text: wayfinderPrompt(
              String(buildingName ?? 'this building').slice(0, 120),
              (directory as DirectoryEntry[]).slice(0, 500),
              question.slice(0, 500),
              typeof current === 'string' ? current.slice(0, 200) : undefined,
            ),
          },
        ],
        schema: WAYFINDER_SCHEMA,
      });
      res.json(out);
    } catch (e) {
      console.error('ask-wayfinder failed:', e instanceof Error ? e.message : e);
      res.status(502).json({ error: e instanceof Error ? e.message : 'Assistant request failed.' });
    }
  });

  return app;
}
