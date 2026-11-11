# Floor plan file names

Floor plans live in `data/floors/`. The info sheet loads one SVG per floor.

The file name is the building code, in lowercase, then a hyphen, then the floor number:

`<building-code>-<floor-number>.svg`

|   Floor  |        File            |
| ---------| ---------------------- |
| Basement | `data/floors/jh-0.svg` |
| Level 1  | `data/floors/jh-1.svg` |
| Level 2  | `data/floors/jh-2.svg` |

`jh` is Jett Hall’s building code, not its property number (`189`). The same pattern works for any building: `hjlc-1.svg` is floor 1 of Hardman and Jacobs.

Each number also has to be listed in that building’s `floors` array in `data/buildings.geojson`. A missing SVG is skipped. The file must be a real SVG, not a photo renamed to `.svg`.
## Rooms a walk may cross

A room is a wall for the indoor walk, so the line goes around it. To let the walk cut through a classroom,
add `passable` to that room's class:

```svg
<polygon class="room passable" points="100,80 200,80 200,120 100,120"/>
<text>110</text>
```

- Only a `room` can be `passable`. A stair `core` or an open-to-below `void` can never be crossed.
- The room is still a normal destination. Searching for it walks you to its door as before.
- `npm test` checks every walk in every building stays on a hallway, a stair, an elevator or a passable room.
