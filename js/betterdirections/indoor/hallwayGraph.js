//This File builds a graph from a list of hallway points.

import { calculateDistanceBetweenPoints, isPointInsidePolygonShape, distanceToPolygonEdge, segmentStaysInsidePolygon, segmentEntersPolygon } from '../shared/geometry.js';
import { describeHallway } from './hallways.js';
import { closestPointOnLine, placeOnNearestHallway } from './placeOnHallway.js';

// Halls of one corridor are sometimes drawn a few pixels apart. 20 covers that gap.
const TOUCH_SLACK = 20;

// Checks if a point is within a box's bounds.
function pointIsInBox(pointX, pointY, box) {
  return (
    pointX >= box.left - TOUCH_SLACK &&
    pointX <= box.right + TOUCH_SLACK &&
    pointY >= box.top - TOUCH_SLACK &&
    pointY <= box.bottom + TOUCH_SLACK
);
}

// Finds the junction of two opposite axis(horizontal and vertical) hallways.
function junctionOfTwoHallways(horizontalHallway, verticalHallway) {
    const pointX = verticalHallway.middle[0];
    const pointY = horizontalHallway.middle[1];
    if (pointIsInBox(pointX, pointY, horizontalHallway.box) && pointIsInBox(pointX, pointY, verticalHallway.box)) {
        return [pointX, pointY];
    }
    return null;
}

// True when two hallway boxes bump into each other (or sit a couple pixels apart).
function hallwayBoxesTouch(boxA, boxB) {
    return !(
        boxA.right < boxB.left - TOUCH_SLACK ||
        boxA.left > boxB.right + TOUCH_SLACK ||
        boxA.bottom < boxB.top - TOUCH_SLACK ||
        boxA.top > boxB.bottom + TOUCH_SLACK
    );
}

// Closest spots on the two centre lines. used when the halls touch
// but the centre lines do not cross (a T, or a short stub on the side).
function closestSpotsOnTwoHallways(hallwayA, hallwayB) {
    const lineA = hallwayA.centerLine;
    const lineB = hallwayB.centerLine;
    const pointsOnA = [lineA.start, lineA.end, hallwayA.middle];
    const pointsOnB = [lineB.start, lineB.end, hallwayB.middle];
    let bestDistance = Infinity;
    let spotOnA = null;
    let spotOnB = null;
    for (let i = 0; i < pointsOnA.length; i++) {
        const onB = closestPointOnLine(pointsOnA[i], lineB.start, lineB.end);
        const onA = closestPointOnLine(onB, lineA.start, lineA.end);
        const distance = calculateDistanceBetweenPoints(onA, onB);
        if (distance < bestDistance) {
            bestDistance = distance;
            spotOnA = onA;
            spotOnB = onB;
        }
    }
    for (let i = 0; i < pointsOnB.length; i++) {
        const onA = closestPointOnLine(pointsOnB[i], lineA.start, lineA.end);
        const onB = closestPointOnLine(onA, lineB.start, lineB.end);
        const distance = calculateDistanceBetweenPoints(onA, onB);
        if (distance < bestDistance) {
            bestDistance = distance;
            spotOnA = onA;
            spotOnB = onB;
        }
    }
    return { spotOnA: spotOnA, spotOnB: spotOnB, distance: bestDistance };
}

// True when the straight link stays on hallway floor, not across a room or the black.
// A real T is a short line that stays inside one hall or the other. A shortcut across the black does not.
// A few pixels of bare floor between two hall drawings of the same corridor is fine.
function linkIsInsideHalls(spotA, spotB, hallA, hallB, rooms, floor) {
    if (segmentStaysInsidePolygon(spotA, spotB, hallA.points)) {
        return true;
    }
    if (segmentStaysInsidePolygon(spotA, spotB, hallB.points)) {
        return true;
    }
    const length = calculateDistanceBetweenPoints(spotA, spotB);
    const steps = Math.max(1, Math.ceil(length / 4));
    let gap = false;
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = spotA[0] + (spotB[0] - spotA[0]) * t;
        const y = spotA[1] + (spotB[1] - spotA[1]) * t;
        const inA = isPointInsidePolygonShape(x, y, hallA.points) || distanceToPolygonEdge(x, y, hallA.points) <= 1;
        const inB = isPointInsidePolygonShape(x, y, hallB.points) || distanceToPolygonEdge(x, y, hallB.points) <= 1;
        if (!inA && !inB) {
            gap = true;
            break;
        }
    }
    if (!gap) {
        return true;
    }
    // The drawings already touch. The center line sits in the middle of the hall,
    // so the step from one center to the other is about half a hall, not the little gap.
    const halfA = Math.min(hallA.width, hallA.height) / 2;
    const halfB = Math.min(hallB.width, hallB.height) / 2;
    if (length > halfA + halfB + TOUCH_SLACK) {
        return false;
    }
    const roomList = rooms || [];
    for (let i = 0; i < roomList.length; i++) {
        if (segmentEntersPolygon(spotA, spotB, roomList[i].points)) {
            return false;
        }
    }
    if (!floor || floor.length < 3) {
        return true;
    }
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = spotA[0] + (spotB[0] - spotA[0]) * t;
        const y = spotA[1] + (spotB[1] - spotA[1]) * t;
        const insideFloor = isPointInsidePolygonShape(x, y, floor) || distanceToPolygonEdge(x, y, floor) <= 2;
        if (!insideFloor) {
            return false;
        }
    }
    return true;
}

// The centre line of a big hall often runs under the rooms drawn on top of it.
// Slide it sideways, inside the same hall, until the whole line is open floor.
function slideCenterLineOffRooms(hall, rooms) {
    if (!rooms || rooms.length === 0) {
        return;
    }
    const missesRooms = (start, end) => {
        for (let i = 0; i < rooms.length; i++) {
            if (segmentEntersPolygon(start, end, rooms[i].points)) {
                return false;
            }
        }
        return true;
    };
    const onHall = (point) => isPointInsidePolygonShape(point[0], point[1], hall.points)
        || distanceToPolygonEdge(point[0], point[1], hall.points) <= 1;
    const line = hall.centerLine;
    if (missesRooms(line.start, line.end)) {
        return;
    }
    const dx = line.end[0] - line.start[0];
    const dy = line.end[1] - line.start[1];
    const length = Math.hypot(dx, dy) || 1;
    const sideX = -dy / length;
    const sideY = dx / length;
    const limit = Math.min(hall.width, hall.height) / 2;
    for (let dist = 4; dist <= limit; dist += 4) {
        for (let sign = -1; sign <= 1; sign += 2) {
            const start = [line.start[0] + sideX * sign * dist, line.start[1] + sideY * sign * dist];
            const end = [line.end[0] + sideX * sign * dist, line.end[1] + sideY * sign * dist];
            if (!onHall(start) || !onHall(end)) {
                continue;
            }
            if (!missesRooms(start, end)) {
                continue;
            }
            hall.centerLine = { start: start, end: end };
            hall.middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
            return;
        }
    }
}

// True when a meeting point sits on both hallway floors, not just inside the flat boxes.
function meetingIsOnBothHalls(meeting, hallA, hallB) {
    const onHall = (hall) => isPointInsidePolygonShape(meeting[0], meeting[1], hall.points)
        || distanceToPolygonEdge(meeting[0], meeting[1], hall.points) <= 1;
    return onHall(hallA) && onHall(hallB);
}


// Builds a graph from a list of hallway points.
// node[i] = a point on (x, y).
// edge.get(i) is a list of { to, cost } - the hallways that meet at this junction, plus along-hall links.
export function graphFromHallways(hallwayPointLists, extraPoints, floorAndRooms) {
    const rooms = floorAndRooms && floorAndRooms.rooms ? floorAndRooms.rooms : [];
    const floor = floorAndRooms && floorAndRooms.floor ? floorAndRooms.floor : null;
    const halls = hallwayPointLists.map(describeHallway);
    for (let h = 0; h < halls.length; h++) {
        slideCenterLineOffRooms(halls[h], rooms);
    }
    const nodes = [];
    const nodeKey = (point) => point[0] + ',' + point[1];
    const indexOfNodes = new Map();

    // Adds a node to the graph and returns the index of the node.
    // If the node already exists, return the index of the node.
    function addNode(point) {
        const key = nodeKey(point);
        if (indexOfNodes.has(key)) {
            return indexOfNodes.get(key);
        }
        const index = nodes.length;
        nodes.push(point);
        indexOfNodes.set(key, index);
        return index;
    }

    // For each hallway, store the indexes of the nodes on that hallway.
    const nodeIndexesOnHallway = halls.map(() => []);

    // for each hallway, add the start and end points of the hallway to the graph.
    // These nodes are used to represent the start and end points of the hallway.
    for (let h = 0; h < halls.length; h++) {
        const startIndex = addNode(halls[h].centerLine.start);
        const endIndex = addNode(halls[h].centerLine.end);
        nodeIndexesOnHallway[h].push(startIndex);
        nodeIndexesOnHallway[h].push(endIndex);
    }

    const linksBetweenHallways = [];

    // for each combination pair of hallways (i, j), find the junction and add edges to the graph.
    for (let i = 0; i < halls.length; i++) {
        for (let j = i + 1; j < halls.length; j++) {
            const hallwayA = halls[i];
            const hallwayB = halls[j];
            if (!hallwayBoxesTouch(hallwayA.box, hallwayB.box)) {
                continue;
            }
            let meeting = null;
            if (hallwayA.walkingAxis === 'horizontal' && hallwayB.walkingAxis === 'vertical') {
                meeting = junctionOfTwoHallways(hallwayA, hallwayB);
            } else if (hallwayA.walkingAxis === 'vertical' && hallwayB.walkingAxis === 'horizontal') {
                meeting = junctionOfTwoHallways(hallwayB, hallwayA);
            }
            if (meeting && meetingIsOnBothHalls(meeting, hallwayA, hallwayB)) {
                const meetingIndex = addNode(meeting);
                nodeIndexesOnHallway[i].push(meetingIndex);
                nodeIndexesOnHallway[j].push(meetingIndex);
                continue;
            }
            const spots = closestSpotsOnTwoHallways(hallwayA, hallwayB);
            if (!spots.spotOnA || !spots.spotOnB) {
                continue;
            }
            const indexOnA = addNode(spots.spotOnA);
            const indexOnB = addNode(spots.spotOnB);
            nodeIndexesOnHallway[i].push(indexOnA);
            nodeIndexesOnHallway[j].push(indexOnB);
            if (indexOnA !== indexOnB && linkIsInsideHalls(spots.spotOnA, spots.spotOnB, hallwayA, hallwayB, rooms, floor)) {
                linksBetweenHallways.push([indexOnA, indexOnB]);
            }
        }
    }

    // for each extra point(ex. a door, a staircase, a lift, etc.), add it to the graph.
    const extraIndexes = [];
    for (const extra of extraPoints || []) {
        const placed = placeOnNearestHallway(extra, halls);
        if (placed.HallwayIndex < 0 || !placed.SpotOnHallway) {
            extraIndexes.push(-1);
            continue;
        }
        const hall = halls[placed.HallwayIndex];
        const onThatHall = isPointInsidePolygonShape(extra[0], extra[1], hall.points)
            || distanceToPolygonEdge(extra[0], extra[1], hall.points) <= 2;
        // A 4-corner hall walks its center line. A many-sided outline's center line is the middle of the building, so a stair stays where it is.
        const spot = onThatHall && hall.points.length !== 4 ? extra : placed.SpotOnHallway;
        const extraIndex = addNode(spot);
        nodeIndexesOnHallway[placed.HallwayIndex].push(extraIndex);
        extraIndexes.push(extraIndex);
    }

    // Initialize the graphs edges.
    const graphEdges = new Map();
    for (let i = 0; i < nodes.length; i++) {
        graphEdges.set(i, []);
    }

    // Add edges to the graph.
    // gets the cost(distance) of the edge between two nodes(from, to), (Point A to Point B).
    function addEdge(from, to) {
        const cost = calculateDistanceBetweenPoints(nodes[from], nodes[to]);
        graphEdges.get(from).push({ to: to, cost: cost});
        graphEdges.get(to).push({ to: from, cost: cost});
    }

    // Add edges to the graph for each hallway.
    // Sort the nodes on the hallway by their x or y coordinate.
    // if the hallway is horizontal, sort by x coordinate.
    // if the hallway is vertical, sort by y coordinate.
    // Add edges between adjacent nodes on the hallway.
    for (let h = 0; h < halls.length; h++) {
        const indexes = [...new Set(nodeIndexesOnHallway[h])];
        if (halls[h].walkingAxis === 'horizontal') {
            indexes.sort((a, b) => nodes[a][0] - nodes[b][0]);
        } else {
            indexes.sort((a, b) => nodes[a][1] - nodes[b][1]);
        }
        for (let k = 1; k < indexes.length; k++) {
            addEdge(indexes[k - 1], indexes[k]);
        }
    }

    for (let i = 0; i < linksBetweenHallways.length; i++) {
        addEdge(linksBetweenHallways[i][0], linksBetweenHallways[i][1]);
    }

    // Return the graph.
    return { graphNodes: nodes, graphEdges: graphEdges, graphHalls: halls, extraIndexes: extraIndexes };
}
