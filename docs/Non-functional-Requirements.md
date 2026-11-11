# Non-functional Requirements

How well the app has to do its job, as opposed to what it does. Each one can be checked.

| # | Requirement | How we check it | Today |
|---|---|---|---|
| N1 | **Works on a phone with no login.** The map, search and directions need no account. | Open the published page on a phone and use every feature. | Met for map, search and directions. |
| N2 | **Fast start.** The first map screen appears quickly. The building file and map style download together, and descriptions load after. | Time first paint on a phone on campus Wi-Fi. | Built that way (`js/main.js`). Not yet measured. |
| N3 | **Search keeps up with typing.** Results update on every key press, and one typo is forgiven in longer words. | `tests/searchMatch.test.js` | Met. |
| N4 | **Accuracy.** Building facts come from NMSU, and each record names its source. A route never goes over empty space, a wall, a stair core or a closed room. | `tests/places.test.js`, `tests/routeCheck.test.js` (every room in every plan) | Met for the 11 traced buildings. |
| N5 | **Honest about gaps.** Where we have no plan, floor count or route, the app says so and never guesses. | A park or lot shows no floor section. A room with no walk says so. | Met. |
| N6 | **Location privacy.** The location is read in the browser to draw the route and is never sent or stored by us. | Review: no network call carries coordinates. | Met by design. Confirm in review. |
| N7 | **Editable without code.** Colours, words and categories live in `config.yml`. Places live in `data/`. | Change a value and refresh. | Met. |
| N8 | **Bad data fails loudly.** A typo in a JSON or YAML file shows the file and line. | `tests/jsonErrorLocator.test.js` | Met. |
| N9 | **Maintainable and tested.** Logic lives apart from page code and is covered by tests. | `npm test` and `npm run coverage` | 72 tests, 91% of lines. |
| N10 | **Works offline for already-loaded pages.** | Not a goal this semester. | Out of scope. |

## Review of all user stories

| Story | Finding | Action |
|---|---|---|
| 1 Pictures of entrances | The constraint says photos we take ourselves. The app shows NMSU's photos from the scraper, and there are no entrance photos yet. | Decide: relax the constraint, or take entrance photos for Sprint 5. |
| 2 Campus map | Matches what is built. "Info matches NMSU's records" is now tested for 12 buildings. | Keep. |
| 3 Search for a room | The elaboration says it takes you to the building. We now take you to the room, and `SH 118A` works. The constraint says rooms come from NMSU's class schedule, but ours come from traced floor plans. | Update the elaboration and constraint. |
| 4 Floor plans | Built for 11 buildings. BL and HA are not traced. | Keep. Add a status note. |
| 5 Directions | Says walking only. We also do biking and driving, with turn-by-turn steps and an arrival message. Indoor walks now exist too. | Update the elaboration. |
| 6 Parking | Needs permit colours from NMSU Parking Services. The scraper gives lots, but no permit colours. | Split: lots on the map (Sprint 4), permit colours (not scheduled). |
| 7 Alerts | The constraint says events are only visible when logged in, but N1 says no login. These conflict. Nothing is built. | Drop it, or rewrite it without login. |
| Effort | The page says the whole project is about 377, but the seven stories add up to 275 (55+21+34+55+55+21+34). | Fix the total, or add the missing stories. |
