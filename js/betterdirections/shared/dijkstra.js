// This file contains the dijkstra algorithm for finding the shortest path in a graph.

// This is just the check list.
// It saves { cost, node } in a array list.
// slot 0 is always the cheapest one.
class cheapestPathFirstList {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    // adds a new item at the end of the list, then swaps it up
    // toward slot 0 while it is cheaper than its parent.
    push(cost, node) {
        const items = this.items;
        items.push({ cost: cost, node: node});
        let indexOfNewItem = items.length - 1;
        while (indexOfNewItem > 0) {
           const parent = Math.floor((indexOfNewItem - 1) / 2);
           if (items[parent].cost <= items[indexOfNewItem].cost) {
            break;
           }
           [items[parent], items[indexOfNewItem]] = [items[indexOfNewItem], items[parent]];
           indexOfNewItem = parent;
        }
    }

    // takes the cheapest item off slot 0 (thats what we return).
    // puts the last item in slot 0, then swaps it down toward bigger indexes
    // while true,
    // if left or right is cheaper, swap with that one and keep going.
    // if both kids are more expensive (or there is no kids), stop.
    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            items[0] = last;
            let indexOfThisItem = 0;
            while (true) {
                const leftItem = indexOfThisItem * 2 + 1;
                const rightItem = leftItem + 1;
                let smallest = indexOfThisItem;
                if (leftItem < items.length && items[leftItem].cost < items[smallest].cost) {
                    smallest = leftItem;
                }
                if (rightItem < items.length && items[rightItem].cost < items[smallest].cost) {
                    smallest = rightItem;
                }
                if (smallest === indexOfThisItem) {
                    break;
                }
                [items[indexOfThisItem], items[smallest]] = [items[smallest], items[indexOfThisItem]];
                indexOfThisItem = smallest;
            }
        }
        return top;
    }
}

// this is the actual search.
// nodeCount = how many nodes.
// starts = the start nodes (can be more than one, like every door). they get cost 0.
// neighboursOf(node) = the nodes next to it, each with a cost.
// keep taking the cheapest off the list. for each neighbour, if going through
// this node is cheaper, save that and put the neighbour on the list.
// cost[i] = cheapest distance from the start to node i. Infinity = never got there.
// fromStart[i] = the node before i on that path. -1 = none.
export function dijkstra(nodeCount, starts, neighboursOf) {
    const cost = new Float64Array(nodeCount).fill(Infinity);
    const fromStart = new Int32Array(nodeCount).fill(-1);
    const list = new cheapestPathFirstList();

    for (const start of starts) {
        if (start >= 0) {
            cost[start] = 0;
            list.push(0, start);
        }
    }

    while (list.size > 0) {
        const { cost: costHere, node } = list.pop();
        if (costHere > cost[node]) {
            continue; // if the cost is greater than the current cost, skip it.
        }
        for (const [nextNode, edgeCost] of neighboursOf(node)) {
            const newCost = costHere + edgeCost;
            if (newCost < cost[nextNode]) {
                cost[nextNode] = newCost;
                fromStart[nextNode] = node;
                list.push(newCost, nextNode);
            }
        }
    }
    return { cost: cost, fromStart: fromStart };
}

// builds the path start to end.
// starts at the end and keeps going to fromStart[node] until -1 (the start),
// then reverse so it reads start ... end. every node on the way, not just one.
export function pathTo(fromStart, end) {
    const path = [];
    for (let node = end; node !== -1; node = fromStart[node]) {
        path.push(node);
    }
    return path.reverse();
}
