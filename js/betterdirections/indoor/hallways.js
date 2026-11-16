//This File describes the properties of a hallway.

// Importing the geometry functions. 
// BoxAroundPolygon: Finds the smallest rectangle that can contain a polygon.
// MiddleOfPolygon: Finds the middle point of the polygon.
import { boxAroundPolygon, middleOfPolygon } from '../shared/geometry.js';


// Finds the size of a hallway in the polygon box points (a hallway is a polygon).
// It finds the smallest rectangle that can contain the hallway 
// Returns the width and height in pixels.
export function sizeOfHallwayInPixels(hallwayPoints) {
    const box = boxAroundPolygon(hallwayPoints);
    return {
        width: box.right - box.left,
        height: box.bottom - box.top
    };
}

// Checks if a hallway is wider than it is tall.
// If wider, people walk left and right
// If taller, people walk up and down.
export function walkingAxisOfHallway(hallwayPoints) {
    const { width, height } = sizeOfHallwayInPixels(hallwayPoints);
    return width >= height ? 'horizontal' : 'vertical';
}

// Finds the center of hallway and marks a line through the center.
// returns the start and end points of the center line. 
function centerLineFromFourCorners(hallwayPoints) {
    const edgeLength = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const firstEdge = edgeLength(hallwayPoints[0], hallwayPoints[1]);
    const secondEdge = edgeLength(hallwayPoints[1], hallwayPoints[2]);
    if (firstEdge >= secondEdge) {
        return {
            start: mid(hallwayPoints[0], hallwayPoints[3]),
            end: mid(hallwayPoints[1], hallwayPoints[2]),
        };
    }
    return {
        start: mid(hallwayPoints[0], hallwayPoints[1]),
        end: mid(hallwayPoints[3], hallwayPoints[2]),
    };
}

export function centerLineOfHallway(hallwayPoints) {
    if (hallwayPoints.length === 4) {
        return centerLineFromFourCorners(hallwayPoints);
    }
    const box = boxAroundPolygon(hallwayPoints);
    const middle = middleOfPolygon(hallwayPoints);
    if (walkingAxisOfHallway(hallwayPoints) === 'horizontal') {
        return {
            start: [box.left, middle[1]],
            end: [box.right, middle[1]]
        };
    } 
    return {
        start: [middle[0], box.top],
        end: [middle[0], box.bottom]
    };
}

// Describes all information about a hallway.
export function describeHallway(hallwayPoints) {
    const box = boxAroundPolygon(hallwayPoints);
    const size = sizeOfHallwayInPixels(hallwayPoints);
    return {
        points: hallwayPoints,
        box: box,
        middle: middleOfPolygon(hallwayPoints),
        width: size.width,
        height: size.height,
        walkingAxis: walkingAxisOfHallway(hallwayPoints),
        centerLine: centerLineOfHallway(hallwayPoints),
    };
}
