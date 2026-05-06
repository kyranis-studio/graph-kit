import { GraphKit } from '../mod.ts';
import { Colors, color } from '../src/utils/colors.ts';

const graph = GraphKit.createGraph({ metadata: { name: 'Basic Example' } });

// Define a simple math node
graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'number', required: false },
  ],
  execute: async (inputs) => ({
    result: (inputs as any).a + (inputs as any).b,
  }),
});

const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
const n2 = graph.addNode('add');

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: 'result',
  targetNodeId: n2.id,
  targetPortId: 'a',
});

// Set n2's b input
graph.updateNodeData(n2.id, { b: 10 });

// Execute
const result = await graph.execute();
console.log(color('Result:', Colors.teal), color(JSON.stringify(Object.fromEntries(result.values)), Colors.sky));
// Should output: { 'n2.result': 18 } (8 + 10)
