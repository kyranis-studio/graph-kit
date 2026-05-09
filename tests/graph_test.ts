import { GraphKit } from '../mod.ts';
import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('GraphKit.createGraph creates a graph with metadata', () => {
  const graph = GraphKit.createGraph({ metadata: { name: 'Test' } });
  assertEquals(graph.metadata?.name, 'Test');
  assertExists(graph.id);
  assertEquals(graph.nodes.size, 0);
  assertEquals(graph.edges.size, 0);
});

Deno.test('GraphKit.createGraph with name shorthand', () => {
  const graph = GraphKit.createGraph({ name: 'My Graph' });
  assertEquals(graph.metadata?.name, 'My Graph');
});

Deno.test('GraphKit.createGraph generates unique IDs', () => {
  const g1 = GraphKit.createGraph();
  const g2 = GraphKit.createGraph();
  assertExists(g1.id);
  assertExists(g2.id);
});

Deno.test('registerNodeType and addNode', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
  assertEquals(n1.type, 'add');
  assertEquals(n1.data.a, 5);
  assertEquals(n1.data.b, 3);
  assertEquals(graph.nodes.size, 1);
});

Deno.test('addNode throws for unregistered type', () => {
  const graph = GraphKit.createGraph();
  try {
    graph.addNode('nonexistent');
    assertEquals(true, false); // Should not reach here
  } catch (e) {
    assertEquals((e as Error).message.includes('not registered'), true);
  }
});

Deno.test('removeNode removes node and its edges', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  const n1 = graph.addNode('pass', { id: 'n1' });
  const n2 = graph.addNode('pass', { id: 'n2' });
  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'out',
    targetNodeId: 'n2',
    targetPortId: 'in',
  });

  assertEquals(graph.nodes.size, 2);
  assertEquals(graph.edges.size, 1);

  graph.removeNode('n1');
  assertEquals(graph.nodes.size, 1);
  assertEquals(graph.edges.size, 0);
});

Deno.test('updateNodeData merges data', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('test', {
    inputs: [{ id: 'x', name: 'X', type: 'string', required: true }],
    outputs: [{ id: 'y', name: 'Y', type: 'string', required: false }],
    execute: async (inputs: any) => ({ y: inputs.x }),
  });

  const node = graph.addNode('test', { data: { x: 'hello' } });
  graph.updateNodeData(node.id, { x: 'world' });
  assertEquals(node.data.x, 'world');
});

Deno.test('addEdge validates source and target nodes', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  const n1 = graph.addNode('pass');

  try {
    graph.addEdge({
      sourceNodeId: n1.id,
      sourcePortId: 'out',
      targetNodeId: 'nonexistent',
      targetPortId: 'in',
    });
    assertEquals(true, false);
  } catch (e) {
    assertEquals((e as Error).message.includes('not found'), true);
  }
});

Deno.test('addEdge validates ports', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  const n1 = graph.addNode('pass', { id: 'n1' });
  const n2 = graph.addNode('pass', { id: 'n2' });

  try {
    graph.addEdge({
      sourceNodeId: 'n1',
      sourcePortId: 'nonexistent',
      targetNodeId: 'n2',
      targetPortId: 'in',
    });
    assertEquals(true, false);
  } catch (e) {
    assertEquals((e as Error).message.includes('not found'), true);
  }
});

Deno.test('getNode returns undefined for missing node', () => {
  const graph = GraphKit.createGraph();
  assertEquals(graph.getNode('nonexistent'), undefined);
});

Deno.test('getEdgesForNode returns edges for a node', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  const n1 = graph.addNode('pass', { id: 'n1' });
  const n2 = graph.addNode('pass', { id: 'n2' });
  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'out',
    targetNodeId: 'n2',
    targetPortId: 'in',
  });

  const n1Edges = graph.getEdgesForNode('n1');
  const n2Edges = graph.getEdgesForNode('n2');
  assertEquals(n1Edges.length, 1);
  assertEquals(n2Edges.length, 1);
});

Deno.test('getPredecessors and getSuccessors', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'in', name: 'In', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.in }),
  });

  const n1 = graph.addNode('pass', { id: 'n1' });
  const n2 = graph.addNode('pass', { id: 'n2' });
  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'out',
    targetNodeId: 'n2',
    targetPortId: 'in',
  });

  assertEquals(graph.getPredecessors('n2').length, 1);
  assertEquals(graph.getPredecessors('n2')[0].id, 'n1');
  assertEquals(graph.getSuccessors('n1').length, 1);
  assertEquals(graph.getSuccessors('n1')[0].id, 'n2');
});

Deno.test('execute graph with a single node', async () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
  const result = await graph.execute(undefined, { logLevel: 'silent' });
  assertEquals(result.values.get(`${n1.id}.result`), 8);
});

Deno.test('execute graph with chained nodes', async () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
  const n2 = graph.addNode('add', { data: { b: 10 } });

  graph.addEdge({
    sourceNodeId: n1.id,
    sourcePortId: 'result',
    targetNodeId: n2.id,
    targetPortId: 'a',
  });

  const result = await graph.execute(undefined, { logLevel: 'silent' });
  assertEquals(result.values.get(`${n2.id}.result`), 18);
});

Deno.test('graph validation detects cycles', () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('pass', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async (inputs: any) => ({ output: inputs.input }),
  });

  const n1 = graph.addNode('pass', { id: 'n1' });
  const n2 = graph.addNode('pass', { id: 'n2' });

  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'output',
    targetNodeId: 'n2',
    targetPortId: 'input',
  });
  graph.addEdge({
    sourceNodeId: 'n2',
    sourcePortId: 'output',
    targetNodeId: 'n1',
    targetPortId: 'input',
  });

  const errors = graph.validate();
  assertEquals(errors.length > 0, true);
});

Deno.test('addEdge throws on dangling edge reference', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async (inputs: any) => ({ output: inputs.input }),
  });

  graph.addNode('pass', { id: 'n1' });

  try {
    graph.addEdge({
      sourceNodeId: 'n1',
      sourcePortId: 'output',
      targetNodeId: 'nonexistent',
      targetPortId: 'input',
    });
    assertEquals(true, false);
  } catch (e) {
    assertEquals((e as Error).message.includes('not found'), true);
  }
});

Deno.test('execute throws on cycle', async () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('pass', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async (inputs: any) => ({ output: inputs.input }),
  });

  graph.addNode('pass', { id: 'n1' });
  graph.addNode('pass', { id: 'n2' });

  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'output',
    targetNodeId: 'n2',
    targetPortId: 'input',
  });
  graph.addEdge({
    sourceNodeId: 'n2',
    sourcePortId: 'output',
    targetNodeId: 'n1',
    targetPortId: 'input',
  });

  await assertRejects(
    async () => {
      await graph.execute(undefined, { logLevel: 'silent' });
    },
    Error,
    'Cycle detected',
  );
});

Deno.test('execute with initialState', async () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('identity', {
    inputs: [{ id: 'val', name: 'Val', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.val }),
  });

  const n1 = graph.addNode('identity', { id: 'n1' });
  const result = await graph.execute(
    { values: new Map([['n1.val', 'hello']]) },
    { logLevel: 'silent' },
  );
  assertEquals(result.values.get('n1.val'), 'hello');
});

Deno.test('toJSON and fromJSON roundtrip', () => {
  const addDef = {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  };

  const graph = GraphKit.createGraph({ metadata: { name: 'Test' } });
  graph.registerNodeType('add', addDef);
  graph.addNode('add', { id: 'n1', data: { a: 1, b: 2 } });

  const json = graph.toJSON();
  const restored = GraphKit.fromJSON(json, { add: addDef });
  assertEquals(restored.id, graph.id);
  assertEquals(restored.metadata?.name, 'Test');
  assertEquals(restored.nodes.size, 1);
  assertEquals(restored.edges.size, 0);
});

Deno.test('toMermaid generates valid output', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.addNode('add', { id: 'n1' });
  graph.addNode('add', { id: 'n2' });
  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'result',
    targetNodeId: 'n2',
    targetPortId: 'a',
  });

  const mermaid = graph.toMermaid();
  assertEquals(mermaid.includes('n1'), true);
  assertEquals(mermaid.includes('n2'), true);
  assertEquals(mermaid.includes('-->'), true);
});

Deno.test('toDOT generates valid output', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.addNode('add', { id: 'n1' });
  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'result',
    targetNodeId: 'n1',
    targetPortId: 'a',
  });

  const dot = graph.toDOT();
  assertEquals(dot.includes('n1'), true);
  assertEquals(dot.includes('->'), true);
});

Deno.test('middleware executes around node', async () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('identity', {
    inputs: [{ id: 'val', name: 'Val', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.val }),
  });

  const n1 = graph.addNode('identity', { id: 'n1', data: { val: 'test' } });

  const logs: string[] = [];
  graph.use(async (ctx, next) => {
    logs.push(`before:${ctx.nodeId}`);
    await next();
    logs.push(`after:${ctx.nodeId}`);
  });

  await graph.execute(undefined, { logLevel: 'silent' });
  assertEquals(logs.length, 2);
  assertEquals(logs[0], 'before:n1');
  assertEquals(logs[1], 'after:n1');
});

Deno.test('event system: on/off/emit', () => {
  const graph = GraphKit.createGraph();
  const calls: string[] = [];

  const handler = (data: unknown) => calls.push((data as any).msg);

  graph.on('test', handler);
  graph.emit('test', { msg: 'hello' });
  assertEquals(calls.length, 1);
  assertEquals(calls[0], 'hello');

  graph.off('test', handler);
  graph.emit('test', { msg: 'world' });
  assertEquals(calls.length, 1);
});

Deno.test('graph events fire during execution', async () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.addNode('add', { id: 'n1', data: { a: 1, b: 2 } });

  const events: string[] = [];
  graph.on('nodeStart', () => events.push('start'));
  graph.on('nodeComplete', () => events.push('complete'));
  graph.on('graphComplete', () => events.push('graphComplete'));

  await graph.execute(undefined, { logLevel: 'silent' });

  assertEquals(events.length, 3);
  assertEquals(events[0], 'start');
  assertEquals(events[1], 'complete');
  assertEquals(events[2], 'graphComplete');
});

Deno.test('ExecutionEngine with logLevel options', async () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.addNode('add', { data: { a: 1, b: 2 } });

  // Silent
  const result1 = await graph.execute(undefined, { logLevel: 'silent' });
  assertExists(result1);

  // Minimal (default)
  const result2 = await graph.execute();
  assertExists(result2);

  // Verbose
  const result3 = await graph.execute(undefined, { logLevel: 'verbose' });
  assertExists(result3);
});
