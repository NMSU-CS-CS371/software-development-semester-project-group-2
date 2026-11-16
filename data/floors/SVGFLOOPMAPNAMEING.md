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
## How a walk uses the plan

The indoor walk follows hallway center lines. It does not step across an 8×8 grid, and it does not cut through a room.

- A shape with `class="hall"` (or a gray `#d5dae0` corridor) is a hallway. A 4-corner hall walks the middle of its long side.
- A shape with `class="room"` is a destination. The line comes in at the door, then to the middle of the room.
- A stair is how a walk changes floors. An open-to-below void is not a hallway.
- There is no `passable` class. A room is never a shortcut.
