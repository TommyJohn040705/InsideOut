/**
 * Firebase Cloud Function wrapping the InsideOut API (server/app.ts).
 * Firebase Hosting rewrites /api/** here (see firebase.json).
 * GEMINI_API_KEY lives in Google Secret Manager and is only read server-side.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createApp } from '../../server/app';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const GEMINI_MODEL = defineString('GEMINI_MODEL', { default: 'gemini-3.8-flash' });

const app = createApp({
  getApiKey: () => GEMINI_API_KEY.value(),
  getModel: () => GEMINI_MODEL.value(),
});

export const api = onRequest(
  {
    region: 'northamerica-northeast2', // Toronto
    secrets: [GEMINI_API_KEY],
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 5,
    invoker: 'public',
  },
  app,
);
