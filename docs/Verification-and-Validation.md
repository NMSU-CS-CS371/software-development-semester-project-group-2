# Verification and Validation

**Verification** asks "did we build it right?". Our automated tests answer that. **Validation** asks "did we build the right thing?". Walking the route on a real phone answers that.

## Verification: automated tests

Run `npm test` for the tests, or `npm run coverage` for the tests with coverage. Result on Nov 11, 2026: **72 tests, 72 pass, 0 fail.**

| Test file | What it proves |
|---|---|
| `tests/searchMatch.test.js` | `SH 118A`, `SH118A` and `118a` find the room. A wrong building code, a wrong number and unrelated words do not. A typo is allowed in longer words only. |
| `tests/directions.test.js` | Distances (ft, mi, m, km), the door closest to you, one-way streets, turn words (left, right, head north, arrive), and driving being faster than walking. |
| `tests/routeCheck.test.js` | For every room on every floor of every building with a plan, the indoor walk never goes over empty space, a wall, a stair core, an open-to-below void or a closed room. A walk may turn at 45°. A room marked `room passable` can be crossed. A stair core cannot. |
| `tests/indoorRoute.test.js` | Walks stay in the middle of the hall, start at the main entrance, reach upper floors by a stair a hall can reach, and offer the elevator. |
| `tests/places.test.js` | Every place has its facts and a defined category. Parks and lots list no floors. Every plan file belongs to a listed floor. At least ten buildings have NMSU-sourced facts, a scraper record and a photo (12 today). |
| `tests/planScale.test.js` | The floor plan is scaled to fit and the scale bar is a round length. |
| `tests/jsonErrorLocator.test.js` | A typo in a JSON file is reported with its line. |

### Coverage report

```
all files             | line % 91.44 | branch % 89.24 | funcs % 93.04
 planRead.js          | 97.69 | 86.08 | 100.00
 route.js             | 90.89 | 88.12 |  95.24
 routeCheck.js        | 95.53 | 90.57 | 100.00
 routeMath.js         | 75.30 | 100.00 | 71.43
 turns.js             | 95.07 | 85.71 | 100.00
 walkEnds.js          | 95.53 | 93.98 |  94.12
 walkGrid.js          | 99.23 | 98.78 | 100.00
 walkSearch.js        | 93.47 | 94.96 |  96.55
 searchMatch.js       | 96.41 | 92.98 | 100.00
 geo.js               | 87.93 | 71.43 | 100.00
 planScale.js         | 88.51 | 55.00 | 100.00
 config.js            | 38.24 | 100.00 |  0.00
```

Only code that can run in Node is measured. The map, GPS, route card and page files need a browser and are not in this report.

### Known gaps in verification

- `routeMath.js` `bestRoute` (the outdoor shortest path) is not covered, because it needs the `geojson-path-finder` library.
- `config.js` needs a browser (`fetch`, `jsyaml`).
- 259 of 810 rooms in the traced plans have no indoor walk. The causes are floor plans, not the router: on BC floor 2 the stairs are 39 to 60 units from any drawn hallway (the reach limit is about 24), on SH floor 3 they are 63 and 124 units away, and many rooms on HH and BC floor 1 touch no traced hallway.

## Validation: does it do what people need?

| Story | Acceptance test | Status |
|---|---|---|
| 2 Campus map | Open on a phone, check the buildings and their info against NMSU's records. | Facts checked by `tests/places.test.js`. Phone check: record who and when here. |
| 3 Search for a room | Search `SH 118A`, check it goes to Science Hall. | Matching tested. Record the in-app result here. |
| 4 Floor plans | Open a building, check the plan matches the posted map. | Compare each traced plan to its photo. Record here. |
| 5 Directions | Get directions, walk the route, check you arrive. | Needs a walk with GPS. Record here. |
