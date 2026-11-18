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

Start: campus map ("Which building are you in?"). Done when: the step-by-step directions to E5 3101
are on screen with **Elevators only** checked and they can say which elevator they'd take.

Expected path: tap **Engineering 5** in the list (or on the map) → **I am at** already shows
"East Ground Entrance & Concourse 1816" → **I want to go to** → type **3101** → pick it →
**Elevators only (step-free)** is checked → summary "2 min · about 92 m · floors 1 → 3" →
**Show the way** → step 5 of 8 reads "Take Southeast Passenger Elevator Bank up 2 floors to Level 3".

Other ways they may find: searching "E5 3101" at the top of the campus map, opening the room and
tapping **Directions**; or **Tell us in words instead** ("I'm at 1816 and need 3101"). Both count.

Watch for: do they pick the building first or search? Do they notice "I am at" is already filled?
Do they look for the step-free box before or after Show the way? Do they use Back / Next or read
the list of all steps? Do they understand the floor buttons (1–6)?

Optional harder version (automatic route, not E5): in **Mathematics & Computer (MC)**, from **3068**
to **6124**, elevators only (about 98 m, elevator up 3 floors; 6124 shows as Chris Bauch's office;
the directions note the route is read automatically from the drawing).

## Task 2: Update the map (report a problem)

> When you get to E5 3101, the **door is locked**. Let the app know so other people are warned.
> (Second participant variant: the **elevator isn't working**.)

Start: the directions from Task 1 still open. Done when: "Saved" appears.

Expected path: **Update the map** (bottom of the directions, or "Locked door or broken elevator?
Update the map" under the form, or **Report a problem** on a room card) → tap **Door locked**
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
