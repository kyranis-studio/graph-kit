import { GraphKit } from '../mod.ts';

const graph = GraphKit.createGraph({ name: 'Basic Math' });

graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [{ id: 'result', name: 'Result', type: 'number' }],
  execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
});

graph.registerNodeType('multiply', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [{ id: 'result', name: 'Result', type: 'number' }],
  execute: async (inputs: any) => ({ result: inputs.a * inputs.b }),
});

const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
const n2 = graph.addNode('multiply', { data: { b: 10 } });

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: 'result',
  targetNodeId: n2.id,
  targetPortId: 'a',
});

const result = await graph.execute();
console.log(`\nFinal Result: ${result.values.get(`${n2.id}.result`)}`);
// (5 + 3) * 10 = 80
