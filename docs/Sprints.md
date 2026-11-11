# Sprints

Our project runs in five sprints. After each sprint we demo in lab, then update this page with what actually happened and the goals for the next one.

Key: ✅ done and checked (a test, or the code and data you can open) · 🟡 built, one step left (named beside it) · ⬜ not done

Roles each sprint

- Scrum master: makes sure we follow the sprint rules — issues have points, issues are assigned, work happens on branches, commits have issue numbers.
- Technical lead: makes sure everyone's work fits together and that every person has something to work on.

## Sprint 1 — Sep 16 to Sep 30, 2026

Scrum master: Taymari La Cour Technical lead: Sebastian Salgado

Goals

1. Get the project skeleton on the main branch so everyone can clone it and run it. ✅
2. Every team member makes a branch, a commit and a pull request. ✅
3. A campus map that opens on a phone, with the buildings we support marked. ✅
4. Tapping a building opens its info sheet with the scraped name, code, photos and address. ✅
5. Wiki has the Home, Problem Statement, User Stories and Sprints pages. ✅
6. Posted evacuation maps photographed for two buildings. ✅

What we will demo: open the site on a phone, see the NMSU campus map, tap a building, see its information.

## Sprint 2 — Sep 30 to Oct 14, 2026

Scrum master: Matthew Holets Technical lead: Brock Patten

Goals

1. All work moves onto personal branches, merged with pull requests. ✅
2. Tracing floor plan to find rooms with the room numbers. ✅
3. A Locations page listing the NMSU properties. ✅
4. Domain model drawn as a UML class diagram and added to the wiki. ✅
5. Posted evacuation maps photographed for three buildings, shown in the app. ✅
6. Build scraper for NMSU maps and info. ✅
7. Add map settings options ✅

What we will demo: search for a building by name or code and land on it.

## Sprint 3 — Oct 14 to Nov 11, 2026 (three weeks)

Scrum master: Brock Patten Technical lead: Sebastian Salgado

Goals

1. Directions from where you are to a building: walking, biking or driving. ✅ (shortest path over walk, bike and drive networks; `tests/directions.test.js`)
2. Turn-by-turn steps and a message when you arrive. ✅ (`js/directions/turns.js`, ends with "Arrive at …")
3. Search: type a building name or code and go to that building. ✅
4. Software Design wiki page with the UML class diagram of our real classes. ✅
5. Non-functional Requirements wiki page, and a review of all user stories. ✅ (`docs/Non-functional-Requirements.md`, to paste into the wiki)
6. Scrape more buildings with a traced floor plan. ✅ (traced plans with rooms for 11 buildings: AY, BC, BX, FH, GN, GO, HH, JH, RH, SH, plus HA with no rooms yet)

What we will demo: pick a building, follow the directions, arrive.

Also done this sprint: indoor walks may turn at 45°, never cross empty space, a wall, a stair core or a closed room, and may cross a room marked `room passable`. 72 tests, 91% line coverage.

## Sprint 4 — Nov 11 to Nov 28, 2026

Scrum master: Wax Sahm Technical lead: Sebastian Salgado

Goals

1. Search a room the way it is written on a class schedule (SH 118A) and go to it. ✅ (`SH 118A`, `SH118A`, `118a` all tested)
2. Directions to the right entrance, then arrows from that door to the room. 🟡 (outdoor route ends at the nearest mapped door; the indoor walk starts at the main entrance, so the two are not yet tied to the same door)
3. Scrape more buildings with a traced floor plan. 🟡 (BL and HA are not traced; BC floor 2, SH floor 3 and HH have stairs or rooms with no hallway beside them, so those rooms have no walk yet)
4. Verification and Validation wiki page with our tests and coverage report. ✅ (`docs/Verification-and-Validation.md`, to paste into the wiki)
5. Photos and facts for ten buildings, all checked against NMSU's records. ✅ (12 buildings pass `tests/places.test.js`: NMSU-sourced facts and code, scraper-written, with a photo)
6. Add Parks and Lots with no floorplan. 🟡 (12 parks are in `data/places.geojson`. Lots are loaded from NMSU Facilities GIS by `python3 tools/build_places.py`: run it once to add them. A Map filters button shows or hides Study, Parks and Parking, and a test enforces "no floors")

What we will demo: type a room code from a schedule and get walked to the room.

## Sprint 5 (Final) — Nov 28 to Dec 2, 2026

Scrum master: Sebastian Salgado Technical lead: Brock Patten

Goals

1. No new features. Fix bugs and finish what is half done. ⬜
2. Practice the six minute final demo until it runs clean. ⬜
3. Status note added to every user story and to the design page. ⬜
4. Close every finished issue; comment on every unfinished one. ⬜
5. All wiki pages reachable from Home, consistent formatting, README finished. ⬜

What we will demo: the finished product, start to finish.
