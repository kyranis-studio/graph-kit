import { GraphKit } from '../mod.ts';

const graph = GraphKit.createGraph({ metadata: { name: 'Custom Nodes Example' } });

// Define a string processing node
graph.registerNodeType('uppercase', {
  inputs: [
    { id: 'text', name: 'Text', type: 'string', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'string', required: false },
  ],
  execute: async (inputs) => ({
    result: ((inputs as any).text as string).toUpperCase(),
  }),
});

// Define a greeting node
graph.registerNodeType('greet', {
  inputs: [
    { id: 'name', name: 'Name', type: 'string', required: true },
  ],
  outputs: [
    { id: 'message', name: 'Message', type: 'string', required: false },
  ],
  execute: async (inputs) => ({
    message: `Hello, ${(inputs as any).name}!`,
  }),
});

const upperNode = graph.addNode('uppercase', { data: { text: 'alice' } });
const greetNode = graph.addNode('greet');

graph.addEdge({
  sourceNodeId: upperNode.id,
  sourcePortId: 'result',
  targetNodeId: greetNode.id,
  targetPortId: 'name',
});

const result = await graph.execute();
console.log('Result:', Object.fromEntries(result.values));
// Should output: { 'greet.message': 'Hello, ALICE!' }
