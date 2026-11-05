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
| `python3 e2e/audit.py http://localhost:3000` | Clicks every control in every mode (92 checks, desktop and mobile) |
| `npm run test:firebase` | Firestore sync and security rules against the Firebase emulators (needs Java) |
| `npm run test:sync-ui` | Two browsers syncing live through the emulators |
| `npm run check:gemini` | Live Gemini call with your `GEMINI_API_KEY` (also available as a GitHub Action) |

To deploy with a URL you can share, see **[DEPLOY.md](DEPLOY.md)**. It uses Firebase App Hosting from the browser, with no local terminal.

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
| Shared sync | Ready, needs a Firebase project | Firestore: live reports for everyone, map edits submitted for admin approval, approved maps pushed to all users. Off (device-only) until Firebase is configured |

## Architecture

```
src/lib/routing.ts          A* search, step builder, place search
src/lib/reports.ts          report lifecycle and which edges they block
src/lib/editor.ts           floor plan editing operations and storage
src/lib/floorPlanImport.ts  AI result to reviewable draft to routable floor
src/lib/assistant.ts        Gemini assistant with a local fallback
src/shared/gemini.ts        prompts, schemas and the REST client (shared by browser and server)
src/data/                   Demo Hall, FloorNav samples and their converter
src/lib/sync/               Firestore sync (reports, proposals, approved maps) + pure helpers
server/app.ts               Express API: /api/health, /api/analyze-floorplan, /api/ask-wayfinder (rate-limited)
server/index.ts             Local / App Hosting server (API + static app)
functions/                  Same API as a Firebase Cloud Function (option B)
firestore.rules             Security rules (tested in firebase-tests/)
e2e/smoke.py                Playwright browser test
```

A building is a graph. Rooms, corridor junctions, stairs, elevators and entrances are nodes in metres. Walkways, stairs and elevators are edges. Routes never pass through other rooms.

## Gemini

Set `GEMINI_API_KEY` in `.env.local` so the key stays on the server. The default model is `gemini-3.8-flash` (the one FloorNav used). You can override it with `GEMINI_MODEL`. Without a server key, you can paste a key into the Add floor screen for that browser session.

## Known limitations

- Sharing needs the Firebase setup in DEPLOY.md. Without it, reports and edits stay on one device.
- Floor photos larger than about 900 KB are not included in synced map updates (Firestore's 1 MiB document limit). Moving them to Cloud Storage is a follow-up.
- There is no live indoor positioning. Navigation advances manually or with Auto walk.
- AI import accuracy depends on the image. The review step and the editor are the safety net.
- The FloorNav sample hallway graphs are approximate (a few door links cross room corners). You can fix them in Edit map.
