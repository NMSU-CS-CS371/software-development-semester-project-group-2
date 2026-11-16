//This File finds the nearest hallway to a given point and returns the index of the hallway, 
// for the spot on the hallway closest to the given point
// if no hallway is found, returns null
// if there are multiple hallways at the same distance, returns the first one found

import { calculateDistanceBetweenPoints, isPointInsidePolygonShape, distanceToPolygonEdge } from '../shared/geometry.js';

// Finds the closest point on a line to a given point
// edgeX gets the difference in x between the start and end points
// edgeY gets the difference in y between the start and end points
// lengthSquared gets the square of the length of the edge
// fraction gets the fraction of the edge that the closest point is from the start point
// formula max 0, min 1 to ensure the fraction is between 0 and 1
// Formula: (startPoint + Fraction * Edge) to get the closest point on the line to the given point
// returns the closest point on the line to the given point
export function closestPointOnLine(point, start, end) {
    const edgeX = end[0] - start[0];
    const edgeY = end[1] - start[1];
    const lengthSquared = edgeX * edgeX + edgeY * edgeY || 1;

    const fraction = Math.max(0, Math.min(1, ((point[0] - start[0]) * edgeX + (point[1] - start[1]) * edgeY) / lengthSquared));
    return [start[0] + fraction * edgeX, start[1] + fraction * edgeY];
}

// Finds the nearest hallway to a given point and returns the index of the hallway, 
// for the spot on the hallway closest to the given point
// if no hallway is found, returns null
// if there are multiple hallways at the same distance, returns the first one found
export function placeOnNearestHallway(point, hallways) {
    let bestHallwayIndex = -1;
    let bestSpotOnHallway = null;
    let bestDistanceFromPoint = Infinity;
    for (let i = 0; i < hallways.length; i++) {
        const hallwayLine = hallways[i].centerLine;
        const spotOnHallway = closestPointOnLine(point, hallwayLine.start, hallwayLine.end);
        const distanceFromPoint = calculateDistanceBetweenPoints(point, spotOnHallway);
        if (distanceFromPoint < bestDistanceFromPoint) {
            bestDistanceFromPoint = distanceFromPoint;
            bestSpotOnHallway = spotOnHallway;
            bestHallwayIndex = i;
        }
    }
    return { HallwayIndex: bestHallwayIndex, SpotOnHallway: bestSpotOnHallway, distanceFromPoint: bestDistanceFromPoint };
}

// The spot on the room's edge closest to a hall. That is the doorway.
// halls: every hall, so a corridor running down a long wall does not beat the door.
export function doorSpotOnRoom(roomPoints, hallSpot, halls) {
    let bestSpot = null;
    let bestDistance = Infinity;
    if (halls && halls.length) {
        for (let i = 0; i < roomPoints.length; i++) {
            const start = roomPoints[i];
            const end = roomPoints[(i + 1) % roomPoints.length];
            const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
            for (let h = 0; h < halls.length; h++) {
                const line = halls[h].centerLine;
                const onLine = closestPointOnLine(mid, line.start, line.end);
                const spot = closestPointOnLine(onLine, start, end);
                const distance = calculateDistanceBetweenPoints(spot, onLine);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestSpot = spot;
                }
            }
        }
        return bestSpot;
    }
    for (let i = 0; i < roomPoints.length; i++) {
        const start = roomPoints[i];
        const end = roomPoints[(i + 1) % roomPoints.length];
        const spot = closestPointOnLine(hallSpot, start, end);
        const distance = calculateDistanceBetweenPoints(hallSpot, spot);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSpot = spot;
        }
    }
    return bestSpot;
}

// True when this spot is inside one of the rooms.
function pointIsInARoom(point, rooms) {
    for (let i = 0; i < rooms.length; i++) {
        if (isPointInsidePolygonShape(point[0], point[1], rooms[i].points)) {
            return true;
        }
    }
    return false;
}

// Slide sideways off a room, staying inside the same hallway. Smallest slide wins.
function slideOffRooms(point, hall, rooms) {
    const limit = hall.walkingAxis === 'horizontal' ? hall.height : hall.width;
    for (let dist = 4; dist <= limit; dist += 4) {
        for (let sign = -1; sign <= 1; sign += 2) {
            const shifted = hall.walkingAxis === 'horizontal'
                ? [point[0], point[1] + sign * dist]
                : [point[0] + sign * dist, point[1]];
            const inside = isPointInsidePolygonShape(shifted[0], shifted[1], hall.points);
            const onEdge = distanceToPolygonEdge(shifted[0], shifted[1], hall.points) <= 1;
            if ((inside || onEdge) && !pointIsInARoom(shifted, rooms)) {
                return shifted;
            }
        }
    }
    return point;
}

// A point on open hallway floor stays put. A point in a room slides to the open part of that hallway.
// A point in empty space moves to the nearest hallway.
export function pushPointOntoHall(point, describedHalls, rooms) {
    const roomList = rooms || [];
    for (let i = 0; i < describedHalls.length; i++) {
        const polygonPoints = describedHalls[i].points;
        const inside = isPointInsidePolygonShape(point[0], point[1], polygonPoints);
        const onEdge = distanceToPolygonEdge(point[0], point[1], polygonPoints) <= 1;
        if (inside || onEdge) {
            if (pointIsInARoom(point, roomList)) {
                return slideOffRooms(point, describedHalls[i], roomList);
            }
            return point;
        }
    }
    const placed = placeOnNearestHallway(point, describedHalls);
    return placed.SpotOnHallway || point;
}