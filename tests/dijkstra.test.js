import test from 'node:test';
import assert from 'node:assert/strict';
import { dijkstra, pathTo } from '../js/betterdirections/shared/dijkstra.js';

// 0 --1-- 1 --1-- 2
//  \--3-----------/
function neighboursOf(node) {
  const edges = [
    [[1, 1], [2, 3]],
    [[0, 1], [2, 1]],
    [[0, 3], [1, 1]],
  ];
  return edges[node];
}

test('cheapest path from start 0 to end 2 is 0, 1, 2', () => {
  const found = dijkstra(3, [0], neighboursOf);
  assert.equal(found.cost[2], 2);
  assert.deepEqual(pathTo(found.fromStart, 2), [0, 1, 2]);
});
