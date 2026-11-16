import { planFromFloorplan } from './floorplanReader.js';
import { middleOfPolygon, isPointInsidePolygonShape, distanceToPolygonEdge, segmentStaysInSomePolygon, segmentEntersPolygon } from '../shared/geometry.js';
import { dijkstra, pathTo } from '../shared/dijkstra.js';
import { graphFromHallways } from './hallwayGraph.js';
import { describeHallway } from './hallways.js';
import { doorSpotOnRoom, pushPointOntoHall } from './placeOnHallway.js';

// Finds a room by its number.
// want: the room number to find.
function roomByNumber(plan, roomNumber) {
    const want = String(roomNumber).toLowerCase();
    for (let i = 0; i < plan.rooms.length; i++) {
        if (plan.rooms[i].number && plan.rooms[i].number.toLowerCase() === want) {
            return plan.rooms[i];
        }
    }
    return null;
}

// returns the neighbours of a room.
function neighboursOfRoom(graph) {
    return (node) => graph.graphEdges.get(node).map((edge) => [edge.to, edge.cost]);
}

// doors if this floor has them (front door or a bridge). stairs if it does not.
function startPointsOnPlan(plan) {
    if (plan.doors.length > 0) {
        return plan.doors;
    }
    const stairPoints = [];
    for (let i = 0; i < plan.stairs.length; i++) {
        stairPoints.push(plan.stairs[i].point);
    }
    return stairPoints;
}

// A stair here and the stair on the other floor that sits nearest it.
// 200px because each floor svg was drawn on its own, so the same stair is not the same pixel.
function stairsOnBothFloors(entryPlan, roomPlan) {
    const pairs = [];
    for (let i = 0; i < entryPlan.stairs.length; i++) {
        const here = entryPlan.stairs[i].point;
        let other = null;
        let closest = Infinity;
        for (let j = 0; j < roomPlan.stairs.length; j++) {
            const there = roomPlan.stairs[j].point;
            const distance = Math.hypot(here[0] - there[0], here[1] - there[1]);
            if (distance < closest) {
                closest = distance;
                other = there;
            }
        }
        if (other && closest <= 200) {
            pairs.push({ here: here, there: other });
        }
    }
    return pairs;
}

// True when the straight piece stays on open hallway: inside a hall, inside the building, not in a room.
function lineStaysOnHallway(start, end, hallPolygons, rooms, floor) {
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const steps = Math.max(1, Math.ceil(length / 8));
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = start[0] + (end[0] - start[0]) * t;
        const y = start[1] + (end[1] - start[1]) * t;
        if (!hallwayFloorIsOpen(x, y, hallPolygons, rooms, floor)) {
            return false;
        }
    }
    return true;
}

// Move points that fell in a room or in empty space back onto a hallway.
function pointsPushedOntoHalls(points, describedHalls, rooms) {
    const pushed = [];
    for (let i = 0; i < points.length; i++) {
        pushed.push(pushPointOntoHall(points[i], describedHalls, rooms));
    }
    return pushed;
}

// True when this spot is hallway floor with no room on top of it.
function hallwayFloorIsOpen(x, y, hallPolygons, rooms, floor) {
    let onHall = false;
    for (let i = 0; i < hallPolygons.length; i++) {
        if (isPointInsidePolygonShape(x, y, hallPolygons[i])) {
            onHall = true;
            break;
        }
    }
    if (!onHall) {
        // The few pixels between two hall drawings. Still floor, still not a room.
        let nearHall = false;
        for (let i = 0; i < hallPolygons.length; i++) {
            if (distanceToPolygonEdge(x, y, hallPolygons[i]) <= 20) {
                nearHall = true;
                break;
            }
        }
        if (!nearHall) {
            return false;
        }
    }
    if (floor && floor.length > 2) {
        const insideFloor = isPointInsidePolygonShape(x, y, floor);
        const onFloorEdge = distanceToPolygonEdge(x, y, floor) <= 2;
        if (!insideFloor && !onFloorEdge) {
            return false;
        }
    }
    for (let i = 0; i < rooms.length; i++) {
        if (isPointInsidePolygonShape(x, y, rooms[i].points)) {
            return false;
        }
    }
    return true;
}

// Walk around a room on the open hallway. Returns the points after start, or null.
function walkAroundRoomViaHallway(start, end, hallPolygons, rooms, floor) {
    const step = 10;
    const round = (n) => Math.round(n / step) * step;
    let goalX = round(end[0]);
    let goalY = round(end[1]);
    // The detour replaces a point in a room. Aim at the nearest open spot, not the far side of the room.
    if (!hallwayFloorIsOpen(goalX, goalY, hallPolygons, rooms, floor)) {
        let bestDistance = Infinity;
        let bestX = null;
        let bestY = null;
        for (let dist = step; dist <= 40; dist += step) {
            for (let dx = -dist; dx <= dist; dx += step) {
                for (let dy = -dist; dy <= dist; dy += step) {
                    const x = goalX + dx;
                    const y = goalY + dy;
                    if (!hallwayFloorIsOpen(x, y, hallPolygons, rooms, floor)) {
                        continue;
                    }
                    const distance = Math.hypot(x - end[0], y - end[1]);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestX = x;
                        bestY = y;
                    }
                }
            }
        }
        if (bestX === null) {
            return null;
        }
        goalX = bestX;
        goalY = bestY;
    }
    const sx = round(start[0]);
    const sy = round(start[1]);
    const key = (x, y) => x + ',' + y;
    const queue = [[sx, sy]];
    const cameFrom = new Map();
    cameFrom.set(key(sx, sy), null);
    let guard = 0;
    let hit = null;
    while (queue.length > 0 && guard < 4000) {
        guard += 1;
        const [x, y] = queue.shift();
        if (Math.abs(x - goalX) <= step && Math.abs(y - goalY) <= step) {
            hit = key(x, y);
            break;
        }
        const steps = [[step, 0], [-step, 0], [0, step], [0, -step]];
        for (let i = 0; i < steps.length; i++) {
            const nx = x + steps[i][0];
            const ny = y + steps[i][1];
            const nextKey = key(nx, ny);
            if (cameFrom.has(nextKey)) {
                continue;
            }
            if (!hallwayFloorIsOpen(nx, ny, hallPolygons, rooms, floor)) {
                continue;
            }
            cameFrom.set(nextKey, key(x, y));
            queue.push([nx, ny]);
        }
    }
    if (!hit) {
        return null;
    }
    const path = [];
    let cursor = hit;
    while (cursor) {
        const parts = cursor.split(',');
        path.push([Number(parts[0]), Number(parts[1])]);
        cursor = cameFrom.get(cursor);
    }
    path.reverse();
    const slim = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
        const a = slim[slim.length - 1];
        const b = path[i];
        const c = path[i + 1];
        const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (turn !== 0) {
            slim.push(b);
        }
    }
    slim.push(path[path.length - 1]);
    slim.shift();
    return slim;
}

// Keep a piece that stays on the hallway. When it would cut a room, walk around on the open floor.
function pointsThatStayOnHalls(points, hallPolygons, rooms, floor) {
    if (points.length === 0) {
        return points;
    }
    const kept = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const previous = kept[kept.length - 1];
        const next = points[i];
        if (previous[0] === next[0] && previous[1] === next[1]) {
            continue;
        }
        if (lineStaysOnHallway(previous, next, hallPolygons, rooms, floor)) {
            kept.push(next);
            continue;
        }
        const around = walkAroundRoomViaHallway(previous, next, hallPolygons, rooms, floor);
        if (around) {
            for (let k = 0; k < around.length; k++) {
                kept.push(around[k]);
            }
        }
    }
    // A loop walks out and comes back over the same hallway. Drop the part in between.
    const trimmed = [];
    for (let i = 0; i < kept.length; i++) {
        const point = kept[i];
        let backTo = -1;
        for (let j = 0; j < trimmed.length - 1; j++) {
            const dx = point[0] - trimmed[j][0];
            const dy = point[1] - trimmed[j][1];
            if (dx * dx + dy * dy <= 18 * 18) {
                backTo = j;
                break;
            }
        }
        if (backTo >= 0) {
            trimmed.length = backTo + 1;
        }
        const last = trimmed[trimmed.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) {
            trimmed.push(point);
        }
    }
    return trimmed;
}

// The last step from the hallway into this room's door.
// Straight across when that stays on floor. Otherwise walk around on the open hall.
function doorStub(last, roomPoints, hallPolygons, rooms, floor, halls) {
    const door = doorSpotOnRoom(roomPoints, last, halls);
    if (!door) {
        return null;
    }
    if (last[0] === door[0] && last[1] === door[1]) {
        return null;
    }
    const polygons = hallPolygons.concat([roomPoints]);
    if (floor && floor.length > 2) {
        polygons.push(floor);
    }
    let crossesAnotherRoom = false;
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].points === roomPoints) {
            continue;
        }
        if (segmentEntersPolygon(last, door, rooms[i].points)) {
            crossesAnotherRoom = true;
            break;
        }
    }
    if (!crossesAnotherRoom && segmentStaysInSomePolygon(last, door, polygons)) {
        return [door];
    }
    const around = walkAroundRoomViaHallway(last, door, hallPolygons, rooms, floor);
    if (!around) {
        return null;
    }
    const tail = around[around.length - 1];
    const step = Math.hypot(door[0] - tail[0], door[1] - tail[1]);
    if (step > 0 && step <= 40) {
        let blocked = false;
        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].points === roomPoints) {
                continue;
            }
            if (segmentEntersPolygon(tail, door, rooms[i].points)) {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            around.push(door);
        }
    }
    return around;
}

// finds a walk on this floorplan from the start points to the end point.
function walkOnFloorplan(plan, endPoint, startPoints, roomPoints) {
    if (!endPoint || plan.halls.length === 0 || startPoints.length === 0) {
        return null;
    }
    const described = [];
    for (let i = 0; i < plan.halls.length; i++) {
        described.push(describeHallway(plan.halls[i]));
    }
    // Aim at the door on the hall, then the room middle is added after the walk.
    let graphEnd = endPoint;
    if (roomPoints) {
        const door = doorSpotOnRoom(roomPoints, endPoint, described);
        if (door) {
            graphEnd = door;
        }
    }
    const extraPoints = [...startPoints, graphEnd];
    const graph = graphFromHallways(plan.halls, extraPoints, { rooms: plan.rooms, floor: plan.floor });
    const startIndexes = [];
    for (let i = 0; i < startPoints.length; i++) {
        if (graph.extraIndexes[i] >= 0) {
            startIndexes.push(graph.extraIndexes[i]);
        }
    }
    const endIndex = graph.extraIndexes[extraPoints.length - 1];
    if (startIndexes.length === 0 || endIndex < 0) {
        return null;
    }
    const found = dijkstra(graph.graphNodes.length, startIndexes, neighboursOfRoom(graph));
    if (found.cost[endIndex] === Infinity) {
        return null;
    }
    const nodePath = pathTo(found.fromStart, endIndex);
    const points = nodePath.map((index) => graph.graphNodes[index]);
    const kept = pointsThatStayOnHalls(pointsPushedOntoHalls(points, described, plan.rooms), plan.halls, plan.rooms, plan.floor);
    // stop on the hallway. a door stub is added only when it does not cross another room.
    if (roomPoints && kept.length > 0) {
        const door = doorStub(kept[kept.length - 1], roomPoints, plan.halls, plan.rooms, plan.floor, described);
        if (door) {
            for (let i = 0; i < door.length; i++) {
                kept.push(door[i]);
            }
        }
        const middle = middleOfPolygon(roomPoints);
        const last = kept[kept.length - 1];
        const atDoor = distanceToPolygonEdge(last[0], last[1], roomPoints) <= 2;
        if (atDoor && isPointInsidePolygonShape(middle[0], middle[1], roomPoints) && (last[0] !== middle[0] || last[1] !== middle[1])) {
            kept.push(middle);
        }
    }
    return kept;
}


// Builds the indoor walk for the picked room.
// start at the doors on that plan, walk the halls to the room.
// if there is no room, or no halls, or no place to start (no doors and no bridge),
// return no walk (blocked: 'room').

export function indoorWalk(entryFloorplanText, roomFloorplanText, roomNumber, entryFloor, roomFloor) {
    const entryPlan = planFromFloorplan(entryFloorplanText);
    if (roomFloor === entryFloor) {
        const room = roomByNumber(entryPlan, roomNumber);
        const roomMiddle = room ? middleOfPolygon(room.points) : null;
        const points = walkOnFloorplan(entryPlan, roomMiddle, startPointsOnPlan(entryPlan), room ? room.points : null);
        if (!points) {
            return { legs: null, main: true, blocked: 'room', via: '', canSwitch: false };
        }
        return { legs: [{ floor: entryFloor, points: points }], main: true, blocked: '', via: '', canSwitch: false };
    }

    const roomPlan = planFromFloorplan(roomFloorplanText);
    const room = roomByNumber(roomPlan, roomNumber);
    const entryStartPoints = startPointsOnPlan(entryPlan);
    const pairs = stairsOnBothFloors(entryPlan, roomPlan);
    if (!room || pairs.length === 0 || entryStartPoints.length === 0) {
        return { legs: null, main: true, blocked: 'stair', via: '', canSwitch: false };
    }
    const roomMiddle = middleOfPolygon(room.points);
    // closest stair to the room first. if that hall does not connect, try the next stair.
    let walkToStair = null;
    let walkOnRoomFloor = null;
    pairs.sort((a, b) => {
        const fromRoomA = Math.hypot(a.there[0] - roomMiddle[0], a.there[1] - roomMiddle[1]);
        const fromRoomB = Math.hypot(b.there[0] - roomMiddle[0], b.there[1] - roomMiddle[1]);
        return fromRoomA - fromRoomB;
    });
    for (let i = 0; i < pairs.length; i++) {
        const down = walkOnFloorplan(entryPlan, pairs[i].here, entryStartPoints);
        const onFloor = walkOnFloorplan(roomPlan, roomMiddle, [pairs[i].there], room.points);
        if (down && onFloor) {
            walkToStair = down;
            walkOnRoomFloor = onFloor;
            break;
        }
    }
    if (!walkToStair || !walkOnRoomFloor) {
        return { legs: null, main: true, blocked: 'stair', via: '', canSwitch: false };
    }
    return {
        legs: [
            { floor: entryFloor, points: walkToStair },
            { floor: roomFloor, points: walkOnRoomFloor },
        ],
        main: true,
        blocked: '',
        via: 'stairs',
        canSwitch: false,
    };
}

export function walkWords(result, floor, number) {
    if (!result || !result.legs) {
        if (result && result.blocked === 'stair') {
            return 'no public stair or elevator reaches this floor ' + floor + '.';
        }
        return 'No walk from the main entrance to Room ' + number + '.';
    }
    return 'From the main entrance to Room' + number + '.';
}