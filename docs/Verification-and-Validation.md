# Verification and Validation

**Verification** asks "did we build it right?". Our automated tests answer that. **Validation** asks "did we build the right thing?". Walking the route on a real phone answers that.

## Verification: automated tests

Run `npm test` for the tests, or `npm run coverage` for the tests with coverage. Result on Nov 11, 2026: **72 tests, 72 pass, 0 fail.**

| Test file | What it proves |
|---|---|
| `tests/searchMatch.test.js` | `SH 118A`, `SH118A` and `118a` find the room. A wrong building code, a wrong number and unrelated words do not. A typo is allowed in longer words only. |
| `tests/directions.test.js` | Distances (ft, mi, m, km), the door closest to you, one-way streets, turn words (left, right, head north, arrive), and driving being faster than walking. |
| `tests/indoorRouteNew.test.js` | A same-floor walk goes from a door to the room. A different floor walks to a stair, then continues on the other floor. |
| `tests/hallwayGraph.test.js` | Crossing halls meet at a junction, and a T still connects the two center lines. |
| `tests/hallways.test.js` | A wide hall's center line runs along the middle, and a tall hall's center line runs up the middle. |
| `tests/dijkstra.test.js` | The cheapest path is the one Dijkstra returns. |
| `tests/geometry.test.js` | Points, boxes, and the inside-a-polygon check. |
| `tests/placeOnHallway.test.js` | A point snaps onto the nearest hallway center line. |
| `tests/places.test.js` | Every place has its facts and a defined category. Parks and lots list no floors. Every plan file belongs to a listed floor. At least ten buildings have NMSU-sourced facts, a scraper record and a photo (12 today). |
| `tests/planScale.test.js` | The floor plan is scaled to fit and the scale bar is a round length. |
| `tests/jsonErrorLocator.test.js` | A typo in a JSON file is reported with its line. |

### Coverage report

The Nov 11 coverage numbers were for the old indoor grid (`walkGrid.js`, `walkSearch.js`, and the rest of `js/directions/`). Those files are gone. Indoor routing is now hallway center lines in `js/betterdirections/indoor/`. Outdoor turns live in `js/betterdirections/outdoor/`.

Only code that can run in Node is measured. The map, GPS, route card and page files need a browser and are not in this report.

### Known gaps in verification

- The outdoor shortest path needs the street network, so it is covered by `tests/directions.test.js` rather than a separate grid check.
- `config.js` needs a browser (`fetch`, `jsyaml`).
- An indoor walk follows the hallway center lines from the doors. Another floor is reached by a stair, not by stepping across an 8×8 grid. A room with no hallway drawn up to its door still has no walk.

## Validation: does it do what people need?

| Story | Acceptance test | Status |
|---|---|---|
| 2 Campus map | Open on a phone, check the buildings and their info against NMSU's records. | Facts checked by `tests/places.test.js`. Phone check: record who and when here. |
| 3 Search for a room | Search `SH 118A`, check it goes to Science Hall. | Matching tested. Record the in-app result here. |
| 4 Floor plans | Open a building, check the plan matches the posted map. | Compare each traced plan to its photo. Record here. |
| 5 Directions | Get directions, walk the route, check you arrive. | Needs a walk with GPS. Record here. |
