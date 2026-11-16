import test from 'node:test';
import assert from 'node:assert/strict';
import { graphFromHallways } from '../js/betterdirections/indoor/hallwayGraph.js';

const horizontal = [[0, 45], [100, 45], [100, 55], [0, 55]];
const vertical = [[45, 0], [55, 0], [55, 100], [45, 100]];
const verticalLeft = [[20, 0], [30, 0], [30, 60], [20, 60]];
const verticalRight = [[70, 0], [80, 0], [80, 60], [70, 60]];

test('two crossing halls make a plus: 4 ends and 1 junction', () => {
  const graph = graphFromHallways([horizontal, vertical]);
  assert.equal(graph.graphNodes.length, 5);
  assert.equal(graph.graphHalls.length, 2);
  const junction = graph.graphNodes.find((node) => node[0] === 50 && node[1] === 50);
  assert.deepEqual(junction, [50, 50]);
  const junctionIndex = graph.graphNodes.indexOf(junction);
  assert.equal(graph.graphEdges.get(junctionIndex).length, 4);
});

test('one horizontal hall crossing two vertical halls connects the two junctions', () => {
  const graph = graphFromHallways([horizontal, verticalLeft, verticalRight]);
  const junctions = graph.graphNodes.filter((node) => node[1] === 50 && (node[0] === 25 || node[0] === 75));
  assert.equal(junctions.length, 2);
  const leftIndex = graph.graphNodes.findIndex((node) => node[0] === 25 && node[1] === 50);
  const rightIndex = graph.graphNodes.findIndex((node) => node[0] === 75 && node[1] === 50);
  const fromLeft = graph.graphEdges.get(leftIndex);
  assert.equal(fromLeft.some((edge) => edge.to === rightIndex && edge.cost === 50), true);
});

// west hall centre is left of the long hall. boxes touch. centre lines do not cross.
test('halls that bump in a T still get a walk between the centre lines', () => {
  const west = [[340, 75], [405, 75], [405, 640], [340, 640]];
  const longHall = [[405, 565], [1035, 565], [1035, 640], [405, 640]];
  const graph = graphFromHallways([west, longHall]);
  assert.equal(graph.graphEdges.size > 4, true);
  let linked = false;
  for (const [from, edges] of graph.graphEdges) {
    for (const edge of edges) {
      const a = graph.graphNodes[from];
      const b = graph.graphNodes[edge.to];
      if (Math.abs(a[0] - b[0]) > 1 && Math.abs(a[1] - b[1]) <= 1) {
        linked = true;
      }
    }
  }
  assert.equal(linked, true);
});
