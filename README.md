# InsideOut

Indoor navigation for buildings with several floors. Search for a room and get a calculated route with turn-by-turn steps. You can ask for step-free (wheelchair) routes, report blocked corridors or broken elevators Waze-style so routes update for everyone, edit floor plans yourself, and add new floors from a photo of a posted plan using Gemini, with a human check before anything goes on the map.

This repository combines the original InsideOut build with the best parts of the FloorNav AI Studio prototype.

## Quick start

```bash
npm install
cp .env.example .env.local    # optional: add GEMINI_API_KEY for AI features
npm run dev                   # app + API on http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Express server with Vite dev middleware and the `/api` routes |
| `npm run dev:client` | Frontend only (Vite). AI features need a key pasted in the app |
| `npm run build` | Type-checks (app, server, config) and builds `dist/` |
| `npm start` | Serves the production build plus the API (`NODE_ENV=production`) |
| `npm test` | Unit and API tests (Vitest) |
| `npm run lint` | oxlint |
| `npm run test:e2e -- http://localhost:3000` | Browser smoke test (desktop and mobile). Needs `pip install playwright` |

## Features

| Area | Status | Notes |
| --- | --- | --- |
| A* routing | Working | Binary-heap A* with an admissible heuristic. Tests check it against Dijkstra on more than 100 room pairs, with and without closures |
| Multiple floors | Working | Stairs and elevators are shafts that link floors. Elevator runs collapse into one step |
| Accessible routes | Working | Removes stairs. Gives a clear message when no step-free route exists |
| Turn-by-turn steps | Working | Left/right turns with nearby landmarks and a walking time estimate (from FloorNav) |
| Navigation mode | Working | Step HUD, a walker marker on the map, auto-walk simulation, and voice guidance through the Web Speech API |
| Crowdsourced reports | Working | Blocked corridor, elevator out of service, stairwell closed. Confirm or clear, 4-hour expiry with extensions, automatic reroute with a notice |
| Floor plan editor | Working | Add, move or delete rooms, corridor points, stairs, elevators and entrances. Connect points, link floors, add or delete floors, export and import JSON |
| AI floor plan import | Working (needs a key) | Camera or upload, then Gemini, then a review screen (accept, reject, rename, link shafts), then a routable floor. Uses the FloorNav prompt and schema |
| AI assistant | Working | Uses Gemini on the server when a key is set. Without one, it answers on the device using the real router (e.g. "nearest washroom", "where is 205") |
| Sample buildings | Working | Demo Hall (3 floors) plus FloorNav's Helix office, Mercy hospital and Skyline airport, each shown over its floor plan image |
| Mobile layout | Working | Responsive single column, touch-sized controls, fixed navigation HUD |
| Storage | Working, this browser only | Buildings and reports are kept in localStorage, so other people's reports are not shared yet |

## Architecture

```
src/lib/routing.ts          A* search, step builder, place search
src/lib/reports.ts          report lifecycle and which edges they block
src/lib/editor.ts           floor plan editing operations and storage
src/lib/floorPlanImport.ts  AI result to reviewable draft to routable floor
src/lib/assistant.ts        Gemini assistant with a local fallback
src/shared/gemini.ts        prompts, schemas and the REST client (shared by browser and server)
src/data/                   Demo Hall, FloorNav samples and their converter
server/index.ts             Express: /api/health, /api/analyze-floorplan, /api/ask-wayfinder
e2e/smoke.py                Playwright browser test
```

A building is a graph. Rooms, corridor junctions, stairs, elevators and entrances are nodes in metres. Walkways, stairs and elevators are edges. Routes never pass through other rooms.

## Gemini

Set `GEMINI_API_KEY` in `.env.local` so the key stays on the server. The default model is `gemini-3.8-flash` (the one FloorNav used). You can override it with `GEMINI_MODEL`. Without a server key, you can paste a key into the Add floor screen for that browser session.

## Known limitations

- Reports and edits are stored per browser, so there is no shared backend yet. Crowdsourcing across users needs a database (e.g. Firestore or Postgres) behind the existing report functions.
- There is no live indoor positioning. Navigation advances manually or with Auto walk.
- AI import accuracy depends on the image. The review step and the editor are the safety net.
- The FloorNav sample hallway graphs are approximate (a few door links cross room corners). You can fix them in Edit map.
