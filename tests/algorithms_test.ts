import { GraphKit } from '../mod.ts';
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { topologicalSort } from '../src/algorithms/sorting.ts';
import { bfs, dfs } from '../src/algorithms/traversal.ts';
import { validateGraph } from '../src/algorithms/validation.ts';

function setupLinearGraph() {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  graph.addNode('pass', { id: 'a' });
  graph.addNode('pass', { id: 'b' });
  graph.addNode('pass', { id: 'c' });

  graph.addEdge({
    sourceNodeId: 'a',
    sourcePortId: 'out',
    targetNodeId: 'b',
    targetPortId: 'in',
  });
  graph.addEdge({
    sourceNodeId: 'b',
    sourcePortId: 'out',
    targetNodeId: 'c',
    targetPortId: 'in',
  });

  return graph;
}

Deno.test('topologicalSort linear graph', () => {
  const graph = setupLinearGraph();
  const result = topologicalSort(graph);
  assertEquals(result, ['a', 'b', 'c']);
});

Deno.test('topologicalSort detects cycles', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  graph.addNode('pass', { id: 'a' });
  graph.addNode('pass', { id: 'b' });

  graph.addEdge({
    sourceNodeId: 'a',
    sourcePortId: 'out',
    targetNodeId: 'b',
    targetPortId: 'in',
  });
  graph.addEdge({
    sourceNodeId: 'b',
    sourcePortId: 'out',
    targetNodeId: 'a',
    targetPortId: 'in',
  });

  try {
    topologicalSort(graph);
    assertEquals(true, false);
  } catch (e) {
    assertEquals((e as Error).message.includes('Cycle detected'), true);
  }
});

Deno.test('topologicalSort handles empty graph', () => {
  const graph = GraphKit.createGraph();
  const result = topologicalSort(graph);
  assertEquals(result, []);
});

Deno.test('BFS traversal', () => {
  const graph = setupLinearGraph();
  const result = bfs(graph, 'a');
  assertEquals(result, ['a', 'b', 'c']);
});

Deno.test('DFS traversal', () => {
  const graph = setupLinearGraph();
  const result = dfs(graph, 'a');
  assertEquals(result, ['a', 'b', 'c']);
});

Deno.test('validateGraph returns empty for valid graph', () => {
  const graph = setupLinearGraph();
  const errors = validateGraph(graph);
  assertEquals(errors, []);
});

Deno.test('validateGraph detects cycle', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  graph.addNode('pass', { id: 'a' });
  graph.addNode('pass', { id: 'b' });

  graph.addEdge({
    sourceNodeId: 'a',
    sourcePortId: 'out',
    targetNodeId: 'b',
    targetPortId: 'in',
  });
  graph.addEdge({
    sourceNodeId: 'b',
    sourcePortId: 'out',
    targetNodeId: 'a',
    targetPortId: 'in',
  });

  const errors = validateGraph(graph);
  assertEquals(errors.length > 0, true);
});

Deno.test('addEdge throws on dangling edge', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  graph.addNode('pass', { id: 'a' });
  try {
    graph.addEdge({
      sourceNodeId: 'a',
      sourcePortId: 'out',
      targetNodeId: 'nonexistent',
      targetPortId: 'in',
    });
    assertEquals(true, false);
  } catch (e) {
    assertEquals((e as Error).message.includes('not found'), true);
  }
});

Deno.test('port types work correctly', () => {
  const graph = GraphKit.createGraph();
  
  graph.registerNodeType('typed', {
    inputs: [
      { id: 's', name: 'Str', type: 'string', required: true },
      { id: 'n', name: 'Num', type: 'number', required: false, defaultValue: 0 },
      { id: 'b', name: 'Bool', type: 'boolean', required: false },
    ],
    outputs: [
      { id: 'a', name: 'Any', type: 'any', required: false },
    ],
    execute: async (inputs: any) => ({ a: inputs.s }),
  });

  const node = graph.addNode('typed', { id: 'typed-node' });
  assertExists(node.inputs.get('s'));
  assertExists(node.inputs.get('n'));
  assertExists(node.inputs.get('b'));
  assertExists(node.outputs.get('a'));
  assertEquals(node.inputs.get('n')!.defaultValue, 0);
});
