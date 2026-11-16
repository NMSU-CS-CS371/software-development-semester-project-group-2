import { rotatePoint } from '../shared/geometry.js';

// Reads the floorplan from the SVG file as text.
// Pulls out the rooms, doors, halls, stairs, and elevators.
// Returns a plan object.

// Finds the text inside a tag in an SVG file. (Name in between " ")
function textOnSVGTag(svgTagText, tagName) {
    const searchForNameOnTag = tagName + '="';
    let start = svgTagText.indexOf(searchForNameOnTag);
    while (start !== -1) {
        const before = start === 0 ? ' ' : svgTagText[start - 1];
        if (before === ' ' || before === '\n' || before === '\t') {
            break;
        }
        start = svgTagText.indexOf(searchForNameOnTag, start + 1);
    }
    if (start === -1) {
        return '';
    }
    const from = start + searchForNameOnTag.length;
    const end = svgTagText.indexOf('"', from);
    if (end === -1) {
        return '';
    }
    return svgTagText.slice(from, end);
}

// Returns the name(s) in between " " in a tag.
function classNameOnTag(svgTagText) {
    return textOnSVGTag(svgTagText, 'class').split(' ');
}

// Returns true if the tag has the is the class name.
function tagIsClassTag(svgTagText, className) {
    const names = classNameOnTag(svgTagText);
    for (let i = 0; i < names.length; i++) {
        if (names[i] === className) {
            return true;
        }
     }
     return false;
}

// Grabs all the numbers from a text string.
// Returns an array of numbers.
// 123, 456, 789 -> [123, 456, 789]
function numbersFromText(text) {
    const nums = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const isBreak = c === ' ' || c === ',' || c === '\n' || c === '\t';
        if (!isBreak && ((c >= '0' && c <= '9') || c === '.' || c === '-')) {
            current = current + c;
        } else {
            if (current !== '') {
                nums.push(Number(current));
                current = '';
            }
        }
    }
    if (current !== '') {
        nums.push(Number(current));
    }
    const points = [];
    for (let i = 0; i < nums.length; i += 2) {
        if (i + 1 < nums.length) {
            points.push([nums[i], nums[i + 1]]);
        }
    }
    return points;
}

// returns the corners of a rectangle polygon in an array list.
function cornersOfRectanglePolygon(svgTagText) {
    const x = Number(textOnSVGTag(svgTagText, 'x'));
    const y = Number(textOnSVGTag(svgTagText, 'y'));
    const width = Number(textOnSVGTag(svgTagText, 'width'));
    const height = Number(textOnSVGTag(svgTagText, 'height'));
    return [
        [x, y], // top left
        [x + width, y], // top right
        [x + width, y + height], // bottom right
        [x, y + height] // bottom left
    ];
}

// Rotates a rectangle around a point.
// The four corners of a rect, turned if the tag has transform="rotate(angle cx cy)".
function cornersOfRotatedRectangle(svgTagText) {
    const corners = cornersOfRectanglePolygon(svgTagText);
    const transform = textOnSVGTag(svgTagText, 'transform');
    const marker = 'rotate(';
    const start = transform.indexOf(marker);
    if (start === -1) {
        return corners;
    }
    const end = transform.indexOf(')', start);
    const inside = end === -1 ? transform.slice(start + marker.length) : transform.slice(start + marker.length, end);
    const parts = inside.replace(/,/g, ' ').split(' ');
    const nums = [];
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] !== '') {
            nums.push(Number(parts[i]));
        }
    }
    if (nums.length < 3) {
        return corners;
    }
    const around = [nums[1], nums[2]];
    const rotated = [];
    for (let i = 0; i < corners.length; i++) {
        rotated.push(rotatePoint(corners[i], nums[0], around));
    }
    return rotated;
}

// A path like M130 5H576V70Z. Hardman draws rooms and halls this way, not as rects.
function pointsFromPath(pathText) {
    const points = [];
    let i = 0;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let command = '';
    function readNum() {
        while (i < pathText.length && (pathText[i] === ' ' || pathText[i] === ',' || pathText[i] === '\n' || pathText[i] === '\t')) {
            i++;
        }
        let numberText = '';
        if (pathText[i] === '-' || pathText[i] === '+') {
            numberText = pathText[i];
            i++;
        }
        while (i < pathText.length && ((pathText[i] >= '0' && pathText[i] <= '9') || pathText[i] === '.')) {
            numberText = numberText + pathText[i];
            i++;
        }
        if (numberText === '' || numberText === '-' || numberText === '+') {
            return null;
        }
        return Number(numberText);
    }
    while (i < pathText.length) {
        const letter = pathText[i];
        const isLetter = (letter >= 'A' && letter <= 'Z') || (letter >= 'a' && letter <= 'z');
        if (isLetter) {
            command = letter;
            i++;
            if (command === 'Z' || command === 'z') {
                x = startX;
                y = startY;
                command = '';
            }
            continue;
        }
        if (command === 'M' || command === 'L' || command === 'm' || command === 'l') {
            const nx = readNum();
            const ny = readNum();
            if (nx === null || ny === null) {
                break;
            }
            if (command === 'm' || command === 'l') {
                x = x + nx;
                y = y + ny;
            } else {
                x = nx;
                y = ny;
            }
            if (command === 'M' || command === 'm') {
                startX = x;
                startY = y;
                command = command === 'M' ? 'L' : 'l';
            }
            points.push([x, y]);
            continue;
        }
        if (command === 'H' || command === 'h') {
            const nx = readNum();
            if (nx === null) {
                break;
            }
            x = command === 'h' ? x + nx : nx;
            points.push([x, y]);
            continue;
        }
        if (command === 'V' || command === 'v') {
            const ny = readNum();
            if (ny === null) {
                break;
            }
            y = command === 'v' ? y + ny : ny;
            points.push([x, y]);
            continue;
        }
        break;
    }
    if (points.length > 1) {
        const first = points[0];
        const last = points[points.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
            points.pop();
        }
    }
    return points;
}

function shapeFromSVGTag(svgTagText, shapeType) {
    if (shapeType === 'rect') {
        return cornersOfRotatedRectangle(svgTagText);
    }
    if (shapeType === 'polygon') {
        return numbersFromText(textOnSVGTag(svgTagText, 'points'));
    }
    if (shapeType === 'path') {
        return pointsFromPath(textOnSVGTag(svgTagText, 'd'));
    }
    return [];
}

function looksLikeRoomNumber(words) {
    const text = words.trim();
    if (text.length === 0 || text.length > 10) {
        return false;
    }
    let hasDigit = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c >= '0' && c <= '9') {
            hasDigit = true;
            break;
        }
    }
    return hasDigit;
}

function floorplanShapeType(svgTagText) {
    if (svgTagText.charAt(1) === '/' || svgTagText.charAt(1) === '!' || svgTagText.charAt(1) === '?') {
        return '';
    }
    let i = 1;
    while (i < svgTagText.length && svgTagText.charAt(i) !== ' ' && svgTagText.charAt(i) !== '>' && svgTagText.charAt(i) !== '/') {
        i++;
    }
    return svgTagText.slice(1, i).toLowerCase();
}

function nextFloorplanTag(svgText, startIndex) {
    const startOfTag = svgText.indexOf('<', startIndex);
    if (startOfTag === -1) {
        return null;
    }
    const endOfTag = svgText.indexOf('>', startOfTag);
    if (endOfTag === -1) {
        return null;
    }
    const tagText = svgText.slice(startOfTag, endOfTag + 1);
    return {
        svgTagText: tagText,
        floorplanShapeType: floorplanShapeType(tagText),
        end: endOfTag + 1,
    };
}

function readStairsFromFloorplanFromStepLines(innerText) {
    let searchFrom = 0;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    while (true) {
        const found = nextFloorplanTag(innerText, searchFrom);
        if (!found) {
            break;
        }
        searchFrom = found.end;
        if (found.floorplanShapeType !== 'line') {
            continue;
        }
        const x1 = Number(textOnSVGTag(found.svgTagText, 'x1'));
        const y1 = Number(textOnSVGTag(found.svgTagText, 'y1'));
        const x2 = Number(textOnSVGTag(found.svgTagText, 'x2'));
        const y2 = Number(textOnSVGTag(found.svgTagText, 'y2'));
        sumX += x1 + x2;
        sumY += y1 + y2;
        count += 2;
        left = Math.min(left, x1, x2);
        top = Math.min(top, y1, y2);
        right = Math.max(right, x1, x2);
        bottom = Math.max(bottom, y1, y2);
    }
    if (count === 0) {
        return null;
    }
    return {
        point: [sumX / count, sumY / count],
        box: { left: left, top: top, right: right, bottom: bottom },
    };
}

export function planFromFloorplan(floorplanText) {
    const plan = {
        halls: [],
        rooms: [],
        doors: [],
        floor: null,
        solids: [],
        voids: [],
        stairs: [],
        elevators: [],
    };
    let roomWaitingForNumber = null;
    let searchFrom = 0;
    let groupDepth = 0;
    let skipLegendUntil = 0;
    while (true) {
        const found = nextFloorplanTag(floorplanText, searchFrom);
        if (!found) {
            break;
        }
        searchFrom = found.end;
        const svgTagText = found.svgTagText;
        const type = found.floorplanShapeType;

        if (svgTagText.startsWith('</g')) {
            if (skipLegendUntil === groupDepth) {
                skipLegendUntil = 0;
            }
            groupDepth = groupDepth - 1;
            continue;
        }
        if (type === 'g') {
            groupDepth = groupDepth + 1;
            const id = textOnSVGTag(svgTagText, 'id');
            if (skipLegendUntil === 0 && (tagIsClassTag(svgTagText, 'diagram-key') || tagIsClassTag(svgTagText, 'legend') || id.indexOf('legend') !== -1)) {
                skipLegendUntil = groupDepth;
            }
        }
        if (skipLegendUntil !== 0) {
            continue;
        }

        if (type === 'g' && tagIsClassTag(svgTagText, 'stair')) {
            const endOfGroup = floorplanText.indexOf('</g>', found.end);
            const inner = endOfGroup === -1 ? '' : floorplanText.slice(found.end, endOfGroup);
            const stair = readStairsFromFloorplanFromStepLines(inner);
            if (stair) {
                plan.stairs.push(stair);
            }
            roomWaitingForNumber = null;
            continue;
        }
        if (type === 'rect' || type === 'polygon' || type === 'path') {
            const shape = shapeFromSVGTag(svgTagText, type);
            const roomNumber = textOnSVGTag(svgTagText, 'data-room-number');
            const fill = textOnSVGTag(svgTagText, 'fill').toLowerCase();
            // Hardman halls are gray paths. The floor-slab is the whole building, not a hall.
            const hallGray = fill === '#d5dae0';
            const floorSlab = textOnSVGTag(svgTagText, 'id').indexOf('floor-slab') !== -1;
            if (tagIsClassTag(svgTagText, 'floor') && shape.length > 2) {
                plan.floor = shape;
                roomWaitingForNumber = null;
            } else if ((tagIsClassTag(svgTagText, 'hall') || (hallGray && !floorSlab)) && shape.length > 2) {
                plan.halls.push(shape);
                roomWaitingForNumber = null;
            } else if (floorSlab && shape.length > 2) {
                plan.floor = shape;
                roomWaitingForNumber = null;
            } else if (tagIsClassTag(svgTagText, 'room') && shape.length > 2 && roomNumber) {
                plan.rooms.push({ number: roomNumber, points: shape });
                roomWaitingForNumber = null;
            } else if (tagIsClassTag(svgTagText, 'room') && shape.length > 2) {
                roomWaitingForNumber = shape;
            } else if (fill === '#edf0f4' && shape.length > 2) {
                plan.rooms.push({ number: '', points: shape });
                roomWaitingForNumber = null;
            } else {
                roomWaitingForNumber = null;
            }
            continue;
        }

        if (type === 'line' && tagIsClassTag(svgTagText, 'door')) {
            const x1 = Number(textOnSVGTag(svgTagText, 'x1'));
            const y1 = Number(textOnSVGTag(svgTagText, 'y1'));
            const x2 = Number(textOnSVGTag(svgTagText, 'x2'));
            const y2 = Number(textOnSVGTag(svgTagText, 'y2'));
            plan.doors.push([(x1 + x2) / 2, (y1 + y2) / 2]);
            roomWaitingForNumber = null;
            continue;
        }

        if (type === 'text') {
            const written = floorplanText.slice(found.end);
            const stop = written.indexOf('<');
            const words = (stop === -1 ? written : written.slice(0, stop)).trim();
            const x = Number(textOnSVGTag(svgTagText, 'x'));
            const y = Number(textOnSVGTag(svgTagText, 'y'));
            // Hardman marks the door and the stair with a label, not a class.
            if (words === 'EXIT') {
                plan.doors.push([x, y]);
            } else if (words === 'Stairs' || (words.length >= 3 && words.length <= 4 && words.slice(0, 2) === 'ST' && words.charAt(2) >= '0' && words.charAt(2) <= '9')) {
                plan.stairs.push({ point: [x, y], box: { left: x, top: y, right: x, bottom: y } });
            }
            if (!roomWaitingForNumber) {
                continue;
            }
            if (looksLikeRoomNumber(words)) {
                plan.rooms.push({
                    number: words,
                    points: roomWaitingForNumber,
                });
            }
            roomWaitingForNumber = null;
            continue;
        }

        roomWaitingForNumber = null;
    }
    if (!plan.floor && plan.halls.length === 1) {
        plan.floor = plan.halls[0];
    }
    return plan;
}

