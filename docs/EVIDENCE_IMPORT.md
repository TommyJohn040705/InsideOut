# Evidence handoff import (2026-11-14)

What came in from `InsideOut_CLAUDE_ALL_IN_ONE.md`, what the app does with it, and what still needs University of Waterloo data or permission.

## Input

- **Only the Markdown file arrived.** The JSON files it mentions (`destinations_verified_sources_2026.json`, `authoritative_sources.json`, `uw_room_classifications_official.json`) and the `.overpassql` query files were not on disk.
  - The destination data was rebuilt from the section 3 table and the section 2 source list.
  - The Overpass queries were not run. The app's OpenStreetMap data comes from the existing scripts in `scripts/campus/` (last refreshed 2026-11-13).
- **`leveldb-main.zip` is not related to this project.** It is Google's LevelDB C++ key-value storage library. Nothing in it helps InsideOut.

## What was built

| File | What it does |
|---|---|
| `scripts/campus/importEvidenceHandoff.mjs` | Parses the handoff and writes `src/data/campus/evidenceDestinations.json`. To rebuild: `node scripts/campus/importEvidenceHandoff.mjs <path to handoff .md>`. It refuses to write if any record looks like it contains a door or keypad code, if a source URL is missing, or if two records share an id. |
| `src/data/campus/evidenceDestinations.json` | 160 records: all 159 table rows plus the New Residence Building. |
| `src/campus/evidenceIndex.ts` | Search, de-duplication, links to campus buildings and to E5 rooms, access labels, and the 2025 check. |
| `src/components/campus/CampusView.tsx` | Campus search shows a "Listed destinations" list above the building results. |
| `tests/evidence.test.ts` | 16 tests covering the section 13 acceptance list. |

**Every record is the same kind of claim:** an official page lists this name at this building and room, checked on 2026-11-14.

- Every record has `geometry_status: not_verified`, `routing_status: search_only`, `historical_2025: not_verified_for_2025` and `accessible: unknown`.
- No record has coordinates.

### Counts by kind

| Kind | Records |
|---|---|
| Washroom (menstrual equity list) | 53 |
| Lab or facility | 29 |
| Food service | 28 |
| Professional office | 23 |
| Residence common area | 12 (11 from the table, plus the New Residence Building) |
| Multi-faith space | 11 |
| Library directory | 3 |
| Administrative service | 1 |
| **Total** | **160** |

### Status, conflicts and links to campus buildings

- **De-duplication.** Records count as duplicates when building, room, kind and normalised name all match. None did. Jeff Casello appears twice, but with different offices (E2 2306 and EV3 3311), so both are kept.
- **Closed.** DC Bytes has a **Closed** badge, sorts after open places, and has no directions button.
- **Planned.** New Residence Building shows **Planned, not open** (it opens in 2027). It isn't linked to any building, so nothing routes to it.
- **Conflicts.** Both are flagged `review_required` and show a "Sources disagree" chip. Neither was merged.
  - **E3 2313 vs 2143.** E3's imported floors don't include either room number, so the floor plan can't settle it.
  - **SLC 3252/3254 vs 3109.** All three numbers exist on the imported SLC floor 3 plan, so the plan can't settle it either.
- **Linking to buildings.** 157 of 160 records link to a campus building.
  - Three codes needed an alias:
    - **V1** becomes `V1_CC` (Village 1 Central Complex).
    - **CLV** becomes `CLV_COMM_CTR` (Columbia Lake Village Community Centre).
    - **PSE** becomes `E7`, based on the building name "Pearl Sullivan Engineering". This is backed by the imported plan: RoboHub's PSE 1339 opens room 1339 on E7 floor 1 (plan `067E7_01FLR`). UW hasn't confirmed the alias, so the result shows a note.
  - Three codes are not linked: **EXP**, **MUS** and **NRB**. They aren't in `buildings.json`, and the handoff says not to guess the EXP/AHS link.
- **Rooms on mapped floors.** 116 records have a room number. 70 of those match a room on a mapped floor (E5's traced plan or an imported Plant Operations plan).
  - Clicking one of those opens the indoor navigator at that room.
  - Turn-by-turn directions inside still only work where that floor's hallways have been drawn.
- **Rooms not on a map.** The other 46 rooms show "Location listed, no indoor route". Clicking one selects the building and explains why there is no indoor route. The directions button only offers a walk to the building's door.
- **E5 rooms.** Three E5 records match an existing E5 room: 1101, 1902/3902 and 2002.
  - E5 3051 is a multi-faith space in the listing but "Room E5-3051" on the E5 map. The result shows both names and flags the room for review.
  - `src/data/e5/rooms.json` is not changed. A test checks its hash against commit 2eb70db.

### What search handles

- **People's names.** For example, "Anita Layton" finds MC 6516.
- **Facility names.** For example, "RoboHub" or "Rapid Prototyping Centre".
- **Room numbers**, including basements. For example, "QNC B709" finds the TEM lab.
- **Kind words** (washroom, prayer, food, cafe, lab, office, residence, library), alone or with a building code. For example, "washroom E5" finds 1902 and 3902.
- **Source nicknames.** "MFCF" finds the Math Faculty Computing Facility rooms, with the MC 3017 help centre first.
- **A building code alone** ("E5", "DC") stays a building search, so these results don't crowd out the building.
- **Questions about 2025.** The year is treated as a question about history. "2025 office for Juan Moreno-Cruz" finds EV3 4257, with the note "2025 office not verified: only a listing checked on 2026-11-14 exists."

### Access labels shown to users

Each access tier gets a plain label. For example:

- RoboHub: "Research space: staff or authorized users only, no unsupervised public entry".
- QNC labs: "Restricted lab".
- MC 3007: "Course-restricted: enrolled students only".
- Washrooms: "Check the washroom type; wheelchair access unknown".

A multi-faith or menstrual-equity listing never makes a room "accessible". **No door or keypad codes are stored**, and a test checks the data file for them.

## Checks run

- `npx vitest run`: 9 files, 46 tests pass (16 of them new).
- `npx tsc --noEmit`: clean.
- `npm run build`: passes. The only warning is the existing one about large chunks.
- **In the browser preview:**
  - "washroom E5" gives two results, both on mapped floors, with accessibility unknown.
  - "DC Bytes" shows the Closed badge with no directions button.
  - "prayer room E5" shows 3051 with the name-conflict note.
  - "Anita Layton" gives MC 6516, on the floor 6 map.
  - Clicking "RoboHub" opens E7 room 1339 in the indoor navigator.

**Not done:**

- The section 13 test for refusing an accessible route where elevator coverage is unverified is handled by the existing route planner. No new test was added for it.
- The OpenStreetMap bounding-box filter test needs the Overpass output, which didn't arrive.
- Nothing was tested from a clean Windows Command Prompt.

## What still needs UW data or permission

None of this can be built from public pages without guessing.

1. **Space Planning / Archibus** (dl-spo@uwaterloo.ca).
   - **Needed:** authoritative room IDs and use codes, owning units, public/private flags, and permission to use them.
   - **Unlocks:** checking every listed room number, and replacing kind guesses with official classifications.
   - **Status:** your prepared email to the Archibus team may not have been sent yet.
2. **Plant Operations.**
   - **Needed:** permission to publish a simplified hallway, door and entrance graph, plus confirmation of stair and elevator stops.
   - **Also needed:** the E5–E3 bridge floor naming, and which of E3 2313 or 2143 is the current washroom.
   - **Unlocks:** directions inside buildings to the 70 listed rooms that are already on mapped floors.
3. **Registrar / Scheduling.**
   - **Needed:** the official list of teaching rooms, with capacity and space type.
4. **Food Services.**
   - **Needed:** a feed or API for outlets and hours by term.
   - **Why:** hours aren't stored now, so nothing in the app says "open now".
   - **Status:** the UW Open Data `FoodServices` endpoint returned 404 when tried earlier.
5. **Campus Housing.**
   - **Needed:** confirmation of public front desks, shared amenities and accessible entrances.
   - **Never:** resident names, room assignments or lock details.
6. **Accessibility directory and service disruptions.**
   - **Needed:** verified accessible entrances, door openers and elevator outages.
   - **Why:** until then, every evidence record stays accessibility "unknown".
7. **Dated 2025 sources.**
   - **Needed:** archived 2025 directory pages.
   - **Why:** this is the only way to mark an office as `verified_2025`. A current profile is not 2025 evidence.

The Library (clickable floor plans) and the Geospatial Centre GIS layers were already requested by you, so no new outreach is drafted for them.
