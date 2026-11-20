# Handoff: where the work stands

Any AI (Claude Code, OpenCode, Codex) reads this first and updates it before stopping, so work can continue when one AI hits its limit. Rules: `AGENTS.md`.

_Last updated: 2026-11-20 by Claude Code._

## State
- `main` has everything merged up to PR #8. Tests: 109 passing.
- Features: campus map, building/room search, indoor + outdoor trips (up to 4 linked buildings), weather-aware routing, My classes (Quest/.ics), 3D floors, share links, live GPS "You're in…", sign scanner, follow-my-steps, offline caching, assistant (Gemini with local Ollama fallback after 12 s).
- Floors: 211 imported in 58 buildings; all placements are drafts (never walked or reviewed).

## Known problems (not fixed)
- Floors that don't fit their OpenStreetMap outline: BMH 1-3, V1 CC 1-2, REV, MKV. The drawings don't match OSM; they need placing by hand.
- 58 of 185 floors have stairs/elevators that don't line up with the floor above or below (`npx tsx scripts/campus/auditStacking.ts`).
- The map's free tiles (OpenFreeMap) take 7-13 s to load; a Google Maps key would make it faster.
- There's no sign-in: anyone who can reach the server can change data. Don't deploy publicly before adding it.
- The GitHub repo is public but contains UW Plant Operations drawings (`data/uploads/`). The owner must decide whether to make it private.

## Next steps
1. Monday 2026-11-23: import the new floor-plan data on a new branch from `main`, then run the two audit scripts.
2. Fix the floors listed above, by hand in the Floor plans studio (`?dev`).
3. Add sign-in before any public hosting.
