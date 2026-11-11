/// <reference types="vite/client" />
import type { MapProvider } from './types';

// Browser-side Google Maps key. Restrict it by HTTP referrer and to the Maps JavaScript
// and Directions APIs. It is unrelated to GEMINI_API_KEY, which stays on the server.
export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
export const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '';

// VITE_MAP_PROVIDER=google|maplibre forces a provider. Default: Google when a key is set.
const forced = import.meta.env.VITE_MAP_PROVIDER as MapProvider | undefined;
export const MAP_PROVIDER: MapProvider =
  forced === 'google' || forced === 'maplibre' ? forced : GOOGLE_MAPS_API_KEY ? 'google' : 'maplibre';
