# FloorNav

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
