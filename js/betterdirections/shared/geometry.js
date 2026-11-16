//This File contains the geometry functions that are used throughout the project.

// Finds the distance between two points on a 2D plane. 
export function calculateDistanceBetweenPoints(pointA, pointB) {
    return Math.hypot(pointB[0] - pointA[0], pointB[1] - pointA[1]);
}

// Turns a point around another point, the same way an SVG rotate(angle cx cy) does.
// degrees: how far to turn. around: the [x, y] it turns around.
export function rotatePoint(point, degrees, around) {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point[0] - around[0];
    const dy = point[1] - around[1];
    return [
        around[0] + dx * cos - dy * sin,
        around[1] + dx * sin + dy * cos,
    ];
}


// Checks if a point is inside a polygon shape.
// it draws a horizontal line from the point and check if it intersects with the polygon
// if the number of intersections is odd, the point is inside the polygon, otherwise it is outside.
export function isPointInsidePolygonShape(pointX, pointY, polygonPoints) {
    let isInside = false;
    for (let i = 0; i < polygonPoints.length; i++) {
        const [startPointX, startPointY] = polygonPoints[i];
        const [endPointX, endPointY] = polygonPoints[(i + 1) % polygonPoints.length];
        const edgeGoesAboveAndBelowPoint = (startPointY > pointY) !== (endPointY > pointY);
        if (edgeGoesAboveAndBelowPoint) {
            const xWhereEdgeIntersectHorizontalLine = startPointX + ((pointY - startPointY) * (endPointX - startPointX) / (endPointY - startPointY));
            if (pointX < xWhereEdgeIntersectHorizontalLine) {
                isInside = !isInside;
            }
        }
    }
    return isInside;
}

// Checks if a point is inside any polygon in a list of polygons.
export function isPointInsideAnyAnyPolygonInArrayList(pointX, pointY, polygonPointsList) {
    return polygonPointsList.some(polygonPoints => isPointInsidePolygonShape(pointX, pointY, polygonPoints));
}

//Finds the smallest rectangle that can contain a polygon.
export function boxAroundPolygon(polygonPoints) {
    const allXCoordinates = polygonPoints.map((corner) => corner[0]);
    const allYCoordinates = polygonPoints.map((corner) => corner[1]);
    return { 
        left: Math.min(...allXCoordinates), 
        top: Math.min(...allYCoordinates), 
        right: Math.max(...allXCoordinates), 
        bottom: Math.max(...allYCoordinates)
    };
}

// Finds the middle point of the polygon box. 
export function middleOfPolygon(polygonPoints) { 
    const box = boxAroundPolygon(polygonPoints);
    return [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
}

// Finds the area of a polygon.
// it uses the shoelace formula: 
// A = 0.5 * |Σ(i=1 to n) (xi * yi+1 - xi+1 * yi)|
export function areaOfPolygon(polygonPoints) {
    let totalArea = 0;
    for (let i = 0; i < polygonPoints.length; i++) {
        const [startPointX, startPointY] = polygonPoints[i];
        const [endPointX, endPointY] = polygonPoints[(i + 1) % polygonPoints.length];
        totalArea += startPointX * endPointY - endPointX * startPointY;
    }
    return Math.abs(totalArea) / 2;
}

// Finds the distance from a point to the closest edge of a polygon.
// it checks each edge of the polygon and finds the shortest distance from the edge to the point(a location).
export function distanceToPolygonEdge(pointX, pointY, polygonPoints) {
    let closestDistance = Infinity;
    for (let i = 0; i < polygonPoints.length; i++) {
        const [startPointX, startPointY] = polygonPoints[i];
        const [endPointX, endPointY] = polygonPoints[(i + 1) % polygonPoints.length];
        const edgeX = endPointX - startPointX;
        const edgeY = endPointY - startPointY;
        const edgeLengthSqared = edgeX * edgeX + edgeY * edgeY || 1; 

        const fractionAlongEdge = Math.max(0, Math.min(1, ((pointX - startPointX) * edgeX + (pointY - startPointY) * edgeY) / edgeLengthSqared));
        const nearestX = startPointX + fractionAlongEdge * edgeX;
        const nearestY = startPointY + fractionAlongEdge * edgeY;
        closestDistance = Math.min(closestDistance, Math.hypot(pointX - nearestX, pointY - nearestY));
    }
    return closestDistance;
}

// True when the straight line from start to end stays inside the polygon.
// A line can start and end inside and still cross outside in the middle, so this checks points along it.
export function segmentStaysInsidePolygon(start, end, polygonPoints) {
    const length = calculateDistanceBetweenPoints(start, end);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = start[0] + (end[0] - start[0]) * t;
        const y = start[1] + (end[1] - start[1]) * t;
        const inside = isPointInsidePolygonShape(x, y, polygonPoints);
        const onEdge = distanceToPolygonEdge(x, y, polygonPoints) <= 1;
        if (!inside && !onEdge) {
            return false;
        }
    }
    return true;
}

// True when every point along the line sits inside at least one polygon in the list.
// Used so a walk can pass from one hallway into the next.
export function segmentStaysInSomePolygon(start, end, polygonList) {
    if (!polygonList || polygonList.length === 0) {
        return false;
    }
    const length = calculateDistanceBetweenPoints(start, end);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = start[0] + (end[0] - start[0]) * t;
        const y = start[1] + (end[1] - start[1]) * t;
        let onOne = false;
        for (let i = 0; i < polygonList.length; i++) {
            const polygonPoints = polygonList[i];
            const inside = isPointInsidePolygonShape(x, y, polygonPoints);
            const onEdge = distanceToPolygonEdge(x, y, polygonPoints) <= 1;
            if (inside || onEdge) {
                onOne = true;
                break;
            }
        }
        if (!onOne) {
            return false;
        }
    }
    return true;
}

// True when the line goes inside a polygon, not just along its wall.
export function segmentEntersPolygon(start, end, polygonPoints) {
    const length = calculateDistanceBetweenPoints(start, end);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const x = start[0] + (end[0] - start[0]) * t;
        const y = start[1] + (end[1] - start[1]) * t;
        const inside = isPointInsidePolygonShape(x, y, polygonPoints);
        const pastTheWall = distanceToPolygonEdge(x, y, polygonPoints) > 1;
        if (inside && pastTheWall) {
            return true;
        }
    }
    return false;
}

