import { GraphKit } from '../mod.ts';
import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('Workflow basic execution', async () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('start', {
    inputs: [],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async () => ({ output: 'started' }),
  });

  graph.registerNodeType('end', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [],
    execute: async () => ({}),
  });

  const workflow = graph.createWorkflow({
    startNode: 'start-node',
    endNode: 'end-node',
  });

  graph.addNode('start', { id: 'start-node' });
  graph.addNode('end', { id: 'end-node' });

  workflow.connect('start-node.output', 'end-node.input');

  const result = await workflow.run();
  assertEquals(result.values.get('start-node.output'), 'started');
});

Deno.test('Workflow with conditional edges', async () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('router', {
    inputs: [{ id: 'val', name: 'Val', type: 'number', required: true }],
    outputs: [{ id: 'output', name: 'Output', type: 'number', required: false }],
    execute: async (inputs: any) => ({ output: inputs.val }),
  });

  graph.registerNodeType('end', {
    inputs: [{ id: 'input', name: 'Input', type: 'number', required: true }],
    outputs: [],
    execute: async () => ({}),
  });

  const workflow = graph.createWorkflow({
    startNode: 'router',
    endNode: 'end-positive',
  });

  graph.addNode('router', { id: 'router', data: { val: 42 } });
  graph.addNode('end', { id: 'end-positive' });
  graph.addNode('end', { id: 'end-negative' });

  workflow.addConditionalEdge({
    sourceNodeId: 'router',
    condition: (state) => {
      const val = state.values.get('router.output') as number;
      return val > 0 ? 'end-positive' : 'end-negative';
    },
  });

  const result = await workflow.run();
  assertEquals(result.values.get('router.output'), 42);
});

Deno.test('Workflow throws on cycle', async () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('pass', {
    inputs: [{ id: 'val', name: 'Val', type: 'string', required: true }],
    outputs: [{ id: 'out', name: 'Out', type: 'string', required: false }],
    execute: async (inputs: any) => ({ out: inputs.val }),
  });

  graph.registerNodeType('end', {
    inputs: [{ id: 'val', name: 'Val', type: 'string', required: true }],
    outputs: [],
    execute: async () => ({}),
  });

  const workflow = graph.createWorkflow({
    startNode: 'n1',
    endNode: 'end',
  });

  graph.addNode('pass', { id: 'n1' });
  graph.addNode('pass', { id: 'n2' });
  graph.addNode('end', { id: 'end' });

  // Create a cycle: n1 -> n2 -> n1
  workflow.connect('n1.out', 'n2.val');
  workflow.connect('n2.out', 'n1.val');

  await assertRejects(
    async () => {
      await workflow.run();
    },
    Error,
    'Cycle detected',
  );
});

Deno.test('Workflow with multiple steps and state updates', async () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.registerNodeType('end', {
    inputs: [{ id: 'val', name: 'Val', type: 'number', required: true }],
    outputs: [],
    execute: async () => ({}),
  });

  const states: any[] = [];
  const workflow = graph.createWorkflow({
    startNode: 'n1',
    endNode: 'end',
    onStateUpdate: (state) => states.push(state),
  });

  graph.addNode('add', { id: 'n1', data: { a: 5, b: 3 } });
  graph.addNode('add', { id: 'n2', data: { b: 10 } });
  graph.addNode('end', { id: 'end' });

  workflow.connect('n1.result', 'n2.a');
  workflow.connect('n2.result', 'end.val');

  const result = await workflow.run();
  assertEquals(result.values.get('n2.result'), 18);
  assertEquals(states.length > 0, true);
});

Deno.test('Workflow with logLevel options', async () => {
  const graph = GraphKit.createGraph();

  graph.registerNodeType('start', {
    inputs: [],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async () => ({ output: 'ok' }),
  });

  graph.registerNodeType('end', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [],
    execute: async () => ({}),
  });

  for (const logLevel of ['silent', 'minimal', 'verbose'] as const) {
    const wf = graph.createWorkflow({
      startNode: 'start-node',
      endNode: 'end-node',
      logLevel,
    });
    graph.addNode('start', { id: 'start-node' });
    graph.addNode('end', { id: 'end-node' });
    wf.connect('start-node.output', 'end-node.input');
    const result = await wf.run();
    assertEquals(result.values.get('start-node.output'), 'ok');
  }
});
