# InsideOut usability test, Round 1 (Nov 16–18)

Two tasks from the mentor brief: (1) find a room on another floor using **Elevators only**,
(2) use **Update the map** to report a locked door or broken elevator. About 10 minutes per person.

## Before each session (5 min)

- [ ] Laptop: `npm run dev`, open http://localhost:3000 on the test phone (same Wi-Fi: use the laptop's
      IP, e.g. http://192.168.x.x:3000) or in the laptop browser at phone size.
- [ ] Pause background room reading so the AI is free for testers:
      `curl -X DELETE http://localhost:3000/api/floor-imports/extract-queue`
      (restart after: `curl -X POST -H "Content-Type: application/json" -d "{}" http://localhost:3000/api/floor-imports/extract-queue`).
- [ ] Open **http://localhost:3000/?dev=0** (tester view: hides Coverage, Floor plans, the map badge and staff tools) so it starts on the campus map with nothing selected. Use **?dev** to get the tools back.
- [ ] After the session: open the reported room and tap **Fixed** to clear the test report.
- [ ] Have this sheet, a timer, and consent to take notes (no names in notes; use P1, P2…).

## Intro (read aloud)

> Thanks for helping. We're testing the app, not you; there are no wrong answers. Please think out
> loud as you go: what you're looking for, what you expect, anything confusing. I can't help during
> a task, but I'll answer questions afterwards. You can stop any time.

## Task 1: Elevators only (another floor)

> You use a wheelchair and you're at the **east entrance of Engineering 5**. Your class is in
> **E5 3101** on the third floor. Find the way there **without using any stairs**.

Start: campus map. Done when: the route to E5 3101 is on screen with **Elevators only** checked
and they can say which elevator they'd take.

Expected path: search "E5 3101" → open it → **Directions** → (start shows "From East Ground Entrance
1816"; tap **Change** if not) → **Elevators only (step-free)** is checked → route shows
"Elevator to L3", about 92 m.

Watch for: do they find the search? Do they notice the start point? Do they look for the
step-free option, and where? Do they understand the floor buttons (1–6) and the "Elevator to L3" tag?

Optional harder version (automatic route, not E5): from **MC 3068** to **MC 1085**, elevators only
(route uses Elevator 1101/3101/4101, about 160 m; the screen notes it's read automatically from the drawing).

## Task 2: Update the map (report a problem)

> When you get to E5 3101, the **door is locked**. Let the app know so other people are warned.
> (Second participant variant: the **elevator isn't working**.)

Start: the route from Task 1 still open. Done when: "Saved" appears.

Expected path: **Update the map** (on the route summary or the room card) → tap **Door locked**
(or **Elevator not working**) → **Continue** → **Submit report** → "Saved".

Watch for: do they find Update the map? Do they type or use the quick buttons? Is "Check and save"
clear? Do they expect a confirmation or that others will see it?

## After each task: one question

> How easy or hard was that, from 1 (very hard) to 7 (very easy)?

## Wrap-up questions (2 min)

1. What was the most confusing moment?
2. Was anything missing that you expected to see?
3. Would you trust the step-free route? Why or why not?
4. Who else do you think would use this?

## Observation sheet (one per participant)

| | Task 1 Elevators only | Task 2 Update the map |
|---|---|---|
| Participant | P__ | |
| Completed? (yes / with help / no) | | |
| Time (mm:ss) | | |
| Ease 1–7 | | |
| Wrong turns (where they tapped first) | | |
| Quotes | | |
| Problems seen (screen + what happened) | | |

## Known limits to mention only if asked

- Routes have not been walked; E5's map is hand-traced, other buildings are read automatically
  from the floor-plan drawings.
- The app doesn't know about card-access or locked doors until someone reports them.
- The map is the free OpenStreetMap-based one, not Google Maps.
