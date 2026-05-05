import { GraphKit } from '../mod.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test('Create graph', () => {
  const graph = GraphKit.createGraph({ metadata: { name: 'Test' } });
  assertEquals(graph.metadata?.name, 'Test');
});

Deno.test('Register node type and execute', async () => {
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

  const result = await graph.execute();
  assertEquals(result.values.get(`${n2.id}.result`), 18);
});
