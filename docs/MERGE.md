# Feature audit and merge matrix

Sources compared on 2026-11-12:

- **Nov 12 FloorNav** (`remix-remix-floornav-nov-12-2026-1-04-41-pm.zip`): byte-identical to this repo's baseline commit `57b512e` except `.gitignore`. Everything in it was already here.
- **Nov 6 FloorNav** (`remix-floornav-nov-6-2026-11-18-15-am (3).zip`): an older fork with features the Nov 12 export lacks.
- **Wayfinder / futurelabs** (`futurelabs-main.zip`): a Next.js app, used as a data source only.

| Feature | Nov 12 | Nov 6 | Wayfinder | In InsideOut now |
|---|---|---|---|---|
| UI shell, search, room card, route planner, bottom sheet | yes | older layout | 3D-first | Nov 12 kept |
| Six E5 floors, hallway graph, A* multi-floor routing | yes | yes | no | Nov 12 kept; vertical links now passed in, not hard-coded to E5 |
| Voice guidance, original drawing toggle, hallway graph toggle, Move rooms editor | yes | yes | no | Nov 12 kept |
| Staff roles, onboarding, Workplace Companion, issue reports, AV specs, safety overlay | yes | no | no | Nov 12 kept |
| Gemini endpoints: contribute, lookup-room, read-sign, ask-wayfinder, analyze-floorplan, transcribe | yes | yes | no | kept; analyze-floorplan gained a `strict` mode with no placeholder hallways |
| Camera sign scanner (`CameraSignScannerModal`) + `/api/recognize-sign` | no | yes | no | ported |
| Checkpoints (`data/e5/checkpoints.ts`) | no | yes | no | ported; marked app-defined (no QR codes are posted), positions taken from the room |
| Indoor position state and blue marker | no | yes (fixed "1.2 m" accuracy) | no | ported without accuracy figures; manual, checkpoint or sign-estimate only |
| Corrections audit (`CorrectionsAuditModal`, `utils/auditLog.ts`) | no | yes (seeded fake entries) | no | ported; seeds removed; synced to the server store |
| E5 validation scenarios (`E5ValidationModal`) | no | yes | no | ported; wording says these are in-app checks, not site checks |
| Google Maps hand-off modal | no | yes | no | ported (menu: "Outside? Walk to E5") |
| Tool-calling assistant (`/api/assistant-chat`, richer offline answers) | no | yes | no | ported (Nov 6 `Assistant.tsx` and `localAssistant.ts`) |
| `/api/health` and offline banner | no | yes | no | ported |
| Tappable floor-change badge on the map | no | yes | no | ported |
| Campus map (Google Maps / MapLibre fallback), footprints, entrances, georeferencing | Phase 2 commits | no | partial | kept |
| Floor-plan manifest (491 records, 248 restricted, 188 codes) | Phase 2 commits | no | yes | kept (same file) |
| Floor-plan import, extraction, review, publish | no | no | ingestion API + studio | new: `FloorPlanStudio`, `/api/floor-imports` |
| Outdoor walking routes on campus paths | no | no | concept | new: OSM path graph + `tripPlanner.ts` |
| Persistent store | localStorage | localStorage | Postgres/Drizzle | new: `data/store.json` + uploads (imports, corrections, room edits, reports) |
| Staff directory (Wayfinder `staff-directory.ts`) | no | no | yes | **not ported**: needs an authorized source and access control |
| 3D view | no | no | yes | **not ported**: optional, and Wayfinder's footprints are placeholders |
| Wayfinder `uwaterloo-real-geography.json` DC/MC/SLC candidates | | | yes | **not imported**: the OSM indoor data already on the map covers DC/MC/SLC with sources |

Removed from Nov 6 on purpose: its seeded corrections ("Facilities Staff (David K.)"), "Official/Verified/Approved checkpoint" labels and the fixed accuracy radius.
