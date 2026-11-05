/**
 * Local / Node server for InsideOut.
 *
 *   npm run dev     -> Vite dev middleware + API on http://localhost:3000
 *   npm start       -> serves the production build in dist/ + API
 *
 * Environment (.env or .env.local): GEMINI_API_KEY, optional GEMINI_MODEL, PORT.
 * On Firebase, the same API runs as a Cloud Function (see functions/).
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

export const app = createApp();

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
    const key = Boolean(process.env.GEMINI_API_KEY?.trim());
    console.log(`InsideOut running on http://localhost:${PORT} (Gemini ${key ? `enabled, ${process.env.GEMINI_MODEL || 'default model'}` : 'not configured'})`);
  });
}

if (process.env.INSIDEOUT_NO_LISTEN !== '1') start();
