"""
tools/indoor_routes.py - walking routes INSIDE a building, on one of our floor plans.

WHAT IT DOES : Used by tools/build_rooms.py. For one floor plan it works out the
               shortest walk from where you come in to every room:
                 floor 1      -> from the nearest outside door (class="door" in the plan)
                 other floors -> from the nearest stairs (class="stair")
               Only open floor is walkable: rooms, stair and lift cores, and "open to
               below" areas are walls. The route stops at the room's edge, because the
               posted evacuation maps don't show room doors.
HOW          : 1. Lay a grid of small squares over the plan and mark each square
                  walkable (inside the building and outside every room) or blocked.
               2. Dijkstra's shortest-path search from every entrance at once (the same
                  family of algorithms map apps use). Squares right next to a wall cost
                  a little more, so routes keep to the middle of hallways.
               3. Straighten the zig-zag grid path: skip squares while a straight line
                  still only crosses walkable squares ("string pulling").
DEPENDS ON   : Python 3 only.
USED BY      : tools/build_rooms.py
"""

import heapq
import math

STEP = 6  # grid square size, in floor-plan units
WALL_CLEARANCE = 3  # squares; closer than this to a wall costs extra
WALL_PENALTY = 2.0  # how many times more a square next to a wall costs
BLOCKING_CLASSES = {'room', 'big', 'ours', 'core', 'void'}  # shapes you can't walk through


def inside(points, x, y):
    """Is (x, y) inside the polygon? (Ray casting: count the edges a line to the right crosses; odd = inside.)"""
    result = False
    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]  # the last corner joins back to the first
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            result = not result
    return result


def bounding_box(points):
    """(smallest x, smallest y, biggest x, biggest y) of a polygon, for a quick 'could it be inside?' test."""
    xs = []
    ys = []
    for point in points:
        xs.append(point[0])
        ys.append(point[1])
    return min(xs), min(ys), max(xs), max(ys)


def distance_to_edge(points, x, y):
    """The shortest distance from (x, y) to the polygon's outline."""
    best = math.inf
    for i in range(len(points)):
        ax, ay = points[i]
        bx, by = points[(i + 1) % len(points)]
        dx = bx - ax
        dy = by - ay
        # How far along the edge the closest point is: 0 = the start, 1 = the end.
        along = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / ((dx * dx + dy * dy) or 1)))
        best = min(best, math.hypot(x - (ax + along * dx), y - (ay + along * dy)))
    return best


class FloorGrid:
    """The floor plan as a grid of walkable and blocked squares."""

    def __init__(self, outlines, blockers):
        """Lay the grid over the building outlines and mark every square walkable or blocked."""
        boxes = []
        for outline in outlines:
            boxes.append(bounding_box(outline))
        self.left = min(box[0] for box in boxes)
        self.top = min(box[1] for box in boxes)
        self.columns = int((max(box[2] for box in boxes) - self.left) / STEP) + 1
        self.rows = int((max(box[3] for box in boxes) - self.top) / STEP) + 1

        # Each blocker with its bounding box, so most squares can skip the slower inside() test.
        blocker_boxes = []
        for blocker in blockers:
            blocker_boxes.append((bounding_box(blocker), blocker))

        self.walkable = []
        for row in range(self.rows):
            self.walkable.append([False] * self.columns)
            for column in range(self.columns):
                x, y = self.centre(row, column)
                self.walkable[row][column] = self.is_open_floor(x, y, outlines, blocker_boxes)
        self.wall_distance = self.measure_wall_distance()

    def is_open_floor(self, x, y, outlines, blocker_boxes):
        """Is a point inside the building and outside every room, core and void?"""
        in_building = False
        for outline in outlines:
            if inside(outline, x, y):
                in_building = True
                break
        if not in_building:
            return False
        for (left, top, right, bottom), blocker in blocker_boxes:
            if left <= x <= right and top <= y <= bottom and inside(blocker, x, y):
                return False
        return True

    def centre(self, row, column):
        """Plan coordinates of a square's centre."""
        return self.left + (column + 0.5) * STEP, self.top + (row + 0.5) * STEP

    def neighbours(self, row, column):
        """The (up to) 8 squares around one square, each with the step length (1, or about 1.41 diagonally)."""
        found = []
        for row_change in (-1, 0, 1):
            for column_change in (-1, 0, 1):
                if row_change == 0 and column_change == 0:
                    continue  # the square itself
                r = row + row_change
                c = column + column_change
                if 0 <= r < self.rows and 0 <= c < self.columns:
                    found.append((r, c, math.hypot(row_change, column_change)))
        return found

    def measure_wall_distance(self):
        """For every square: how many squares away the nearest blocked square is (up to WALL_CLEARANCE)."""
        distance = []
        frontier = []  # the squares found at the current distance, starting with every blocked square
        for r in range(self.rows):
            distance.append([])
            for c in range(self.columns):
                if self.walkable[r][c]:
                    distance[r].append(WALL_CLEARANCE)
                else:
                    distance[r].append(0)
                    frontier.append((r, c))

        # Spread out from the walls one ring of squares at a time ("breadth-first").
        for level in range(1, WALL_CLEARANCE):
            next_frontier = []
            for r, c in frontier:
                for nr, nc, _ in self.neighbours(r, c):
                    if distance[nr][nc] > level:
                        distance[nr][nc] = level
                        next_frontier.append((nr, nc))
            frontier = next_frontier
        return distance

    def nearest_walkable(self, x, y):
        """The walkable square closest to a point on the plan."""
        best = None
        best_distance = math.inf
        for row in range(self.rows):
            for column in range(self.columns):
                if not self.walkable[row][column]:
                    continue
                cx, cy = self.centre(row, column)
                d = math.hypot(cx - x, cy - y)
                if d < best_distance:
                    best = (row, column)
                    best_distance = d
        return best

    def shortest_paths_from(self, starts):
        """
        Dijkstra's algorithm from all the start squares at once.
        Returns (cost, came_from): the cheapest cost to reach every square, and the
        square each one was reached from (follow it back to get the path).
        """
        cost = {}
        came_from = {}
        queue = []  # a "priority queue": heapq always gives back the cheapest square first
        for square in starts:
            cost[square] = 0.0
            came_from[square] = None
            queue.append((0.0, square))

        while queue:
            so_far, (row, column) = heapq.heappop(queue)
            if so_far > cost[(row, column)]:
                continue  # an old, more expensive entry for a square we've already done
            for r, c, length in self.neighbours(row, column):
                if not self.walkable[r][c]:
                    continue
                if self.wall_distance[r][c] < WALL_CLEARANCE:
                    new_cost = so_far + length * WALL_PENALTY
                else:
                    new_cost = so_far + length * 1.0
                if new_cost < cost.get((r, c), math.inf):
                    cost[(r, c)] = new_cost
                    came_from[(r, c)] = (row, column)
                    heapq.heappush(queue, (new_cost, (r, c)))
        return cost, came_from

    def clear_line(self, a, b):
        """Can you walk in a straight line from square a to square b without touching a blocked square?"""
        r1, c1 = a
        r2, c2 = b
        steps = int(max(abs(r2 - r1), abs(c2 - c1)) * 2) + 1
        for i in range(steps + 1):
            t = i / steps
            r = round(r1 + (r2 - r1) * t)
            c = round(c1 + (c2 - c1) * t)
            if not self.walkable[r][c] or self.wall_distance[r][c] < 2:
                return False
        return True

    def straighten(self, squares):
        """Drop the in-between squares wherever a straight line works ("string pulling")."""
        kept = [squares[0]]
        i = 0
        while i < len(squares) - 1:
            j = len(squares) - 1  # try the farthest square first
            while j > i + 1 and not self.clear_line(squares[i], squares[j]):
                j -= 1
            kept.append(squares[j])
            i = j
        return kept


def routes_for_floor(outlines, blockers, entrances, rooms):
    """
    The shortest route to every room on one floor.
    outlines  : the building's outline polygons on this plan
    blockers  : every room / core / void polygon
    entrances : [(x, y), ...] doors (floor 1) or stairs (other floors)
    rooms     : [{'number', 'points'}, ...]
    Returns {room number: [[x, y], ...] from the entrance to the room's edge}.
    Rooms that can't be reached are left out.
    """
    if not entrances:
        return {}
    grid = FloorGrid(outlines, blockers)
    starts = {}  # start square -> the entrance point it belongs to
    for x, y in entrances:
        starts[grid.nearest_walkable(x, y)] = (x, y)
    cost, came_from = grid.shortest_paths_from(list(starts))

    routes = {}
    for room in rooms:
        # The walk ends on a square just outside this room's edge: the cheapest one.
        best_goal = None
        for square in cost:
            centre_x, centre_y = grid.centre(square[0], square[1])
            if distance_to_edge(room['points'], centre_x, centre_y) > STEP * 1.5:
                continue
            if best_goal is None or cost[square] < cost[best_goal]:
                best_goal = square
        if best_goal is None:
            continue

        # Follow came_from back to the entrance, then turn the list around.
        squares = []
        square = best_goal
        while square is not None:
            squares.append(square)
            square = came_from[square]
        squares.reverse()

        path = [list(starts[squares[0]])]
        for kept in grid.straighten(squares):
            path.append(list(grid.centre(kept[0], kept[1])))
        rounded = []
        for x, y in path:
            rounded.append([round(x, 1), round(y, 1)])
        routes[room['number']] = rounded
    return routes
