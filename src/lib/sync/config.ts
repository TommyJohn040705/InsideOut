import type { FirebaseOptions } from 'firebase/app';
import type { SyncBackend } from './backend';

/**
 * Finds the Firebase web config. In order:
 *   1. VITE_FIREBASE_* build variables (local development, other hosts)
 *   2. /__/firebase/init.json, which Firebase Hosting serves automatically
 *   3. /api/firebase-config, which the InsideOut server serves on App Hosting
 * The web config is not a secret; access is controlled by firestore.rules.
 * Returns null when Firebase is not set up, so the app stays local-only.
 */
export async function loadFirebaseConfig(fetchImpl: typeof fetch = fetch): Promise<FirebaseOptions | null> {
  const env = import.meta.env;
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      appId: env.VITE_FIREBASE_APP_ID,
    };
  }
  for (const url of ['/__/firebase/init.json', '/api/firebase-config']) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) continue;
      const cfg = (await res.json()) as FirebaseOptions;
      if (cfg?.apiKey && cfg?.projectId) return cfg;
    } catch {
      // try the next source
    }
  }
  return null;
}

/** Creates the Firestore backend if Firebase is configured. Loads the SDK lazily. */
export async function createSyncBackend(): Promise<SyncBackend | null> {
  const config = await loadFirebaseConfig();
  if (!config) return null;
  const { FirestoreBackend } = await import('./firestoreBackend');
  const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST as string | undefined;
  const backend = new FirestoreBackend(
    config,
    emulatorHost ? { emulator: { host: emulatorHost, firestorePort: 8080, authPort: 9099 } } : {},
  );
  await backend.whenReady();
  return backend;
}
