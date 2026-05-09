import { GraphKit } from '../mod.ts';

const graph = GraphKit.createGraph({ name: 'Export Demo' });

graph.registerNodeType('input', {
  inputs: [],
  outputs: [{ id: 'value', name: 'Value', type: 'string' }],
  execute: async () => ({ value: 'data' }),
});

graph.registerNodeType('process', {
  inputs: [{ id: 'data', name: 'Data', type: 'string', required: true }],
  outputs: [{ id: 'result', name: 'Result', type: 'string' }],
  execute: async (inputs: any) => ({ result: `processed: ${inputs.data}` }),
});

const n1 = graph.addNode('input', { id: 'source' });
const n2 = graph.addNode('process', { id: 'processor' });

graph.addEdge({
  sourceNodeId: 'source',
  sourcePortId: 'value',
  targetNodeId: 'processor',
  targetPortId: 'data',
});

console.log('\n--- Mermaid ---');
console.log(graph.toMermaid());

console.log('\n--- DOT ---');
console.log(graph.toDOT());
