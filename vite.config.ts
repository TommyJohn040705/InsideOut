import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Firebase App Hosting provides the linked web app's config at build time.
// Expose it to the client as VITE_FIREBASE_* (the web config is public by design).
function firebaseWebConfigEnv(): Record<string, string> {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG
  if (!raw) return {}
  try {
    const c = JSON.parse(raw)
    return {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(c.apiKey ?? ''),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(c.projectId ?? ''),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(c.authDomain ?? ''),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(c.appId ?? ''),
    }
  } catch {
    return {}
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: firebaseWebConfigEnv(),
})
