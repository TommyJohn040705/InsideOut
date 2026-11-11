# InsideOut

Indoor and outdoor navigation for the University of Waterloo main campus. Built on the Remix FloorNav app (Nov 10 2026 export); the E5 indoor navigator below is unchanged and is opened from the campus map.

## Campus map (Phase 2)

- `src/components/campus/CampusView.tsx`: full-screen campus map, building search, building card, floor chips, coverage dashboard.
- `src/campus/map/`: one `CampusMapAdapter` interface with two engines.
  - `googleAdapter.ts`: official Google Maps JavaScript API. Used when `VITE_GOOGLE_MAPS_API_KEY` is set in `.env.local`.
  - `maplibreAdapter.ts`: development fallback (MapLibre + OpenFreeMap). Labelled in the UI as not Google Maps. No outdoor walking directions.
- `src/campus/georef.ts`: floor-plan georeferencing (image pixels <-> metres <-> lat/lng), least-squares similarity fit from control points, residuals kept.
- `src/data/campus/georef/<BUILDING>.json`: control points per building. Only E5 exists, as a draft fit to its OpenStreetMap footprint (1.4 m RMS, not surveyed).
- `src/campus/campusData.ts`: campus building database and the `INDOOR` registry. To add a building: add its floor plans to the app, write its georef JSON, add one `INDOOR` entry.
- `scripts/campus/fetchOsm.mjs` then `scripts/campus/buildCampusData.mjs`: rebuild `src/data/campus/*.json` from OpenStreetMap (ODbL, attribution required) and the Plant Operations floor-plan manifest in `data-sources/wayfinder/`.

Keys: the Google Maps key is a browser key (`VITE_GOOGLE_MAPS_API_KEY`), restricted by HTTP referrer and to the Maps JavaScript and Directions APIs. `GEMINI_API_KEY` stays server-side. See `.env.example`.

Tests: `npm test` (georeferencing maths, E5 fit against the drawing scale, campus database integrity).

What is not verified: every footprint and entrance is unreviewed OpenStreetMap data; the E5 alignment is a footprint fit; no route has been walked; 248 of the 489 listed floor plans are restricted documents and none besides E5 has been imported.

# FloorNav (E5 indoor navigator)

Indoor maps and walking directions for University of Waterloo Engineering 5 (E5), built from the official floor plans. Made for staff who need to reach a room fast and keep room information up to date.

## What it does
- Clean maps of all six E5 floors, traced from the floor plan PDFs, with a hallway network so routes stay in corridors and use the elevators between floors
- Search rooms, tap any room, get turn-by-turn directions with a live walk view
- Ask FloorNav: nearest washroom, elevator, exit, food, or "where is 3101" (common questions work offline)
- Update the map: type anything or add a photo. AI sorts it into room info, problem reports (elevator out, door locked, hallway blocked) or a new floor plan. Nothing saves until you approve it.
- Search the web for what a room is used for (Gemini with Google Search, with sources)
- First-time tour, phone-first layout, Add to Home Screen

## Run in Google AI Studio
Build > + > Import from GitHub > this repository. The Gemini API key is set up as a server secret automatically.

## Run locally
1. `npm install`
2. Put `GEMINI_API_KEY=...` in `.env.local`
3. `npm run dev`, then open http://localhost:3000

## Project layout
- `server.ts`: Express server and the Gemini endpoints (`/api/contribute`, `/api/lookup-room`, `/api/read-sign`, `/api/ask-wayfinder`, `/api/analyze-floorplan`)
- `src/components/MapView.tsx`: pan, zoom, pinch map with route and walker
- `src/utils/pathfinding.ts`: A* routing across floors
- `src/data/e5/`: rooms, floors, hallway network and verified building facts
- `public/e5_flr*_map.svg`: traced floor maps
- `tools/floorplan-tracer/`: the scripts that traced the maps from the PDFs

The floor plans belong to the University of Waterloo. Keep this repository private.
