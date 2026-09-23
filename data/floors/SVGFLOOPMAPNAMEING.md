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