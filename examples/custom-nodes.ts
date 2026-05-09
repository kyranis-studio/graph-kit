import { GraphKit } from '../mod.ts';

const graph = GraphKit.createGraph({ name: 'String Pipeline' });

graph.registerNodeType('uppercase', {
  inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
  outputs: [{ id: 'output', name: 'Output', type: 'string' }],
  execute: async (inputs: any) => ({ output: (inputs.input as string).toUpperCase() }),
});

graph.registerNodeType('greet', {
  inputs: [{ id: 'name', name: 'Name', type: 'string', required: true }],
  outputs: [{ id: 'message', name: 'Message', type: 'string' }],
  execute: async (inputs: any) => ({
    message: `Hello, ${inputs.name}! Welcome to GraphKit.`,
  }),
});

const n1 = graph.addNode('uppercase', { data: { input: 'world' } });
const n2 = graph.addNode('greet', {});

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: 'output',
  targetNodeId: n2.id,
  targetPortId: 'name',
});

const result = await graph.execute();
console.log(`\nGreeting: ${result.values.get(`${n2.id}.message`)}`);
