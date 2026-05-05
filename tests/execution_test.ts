import { GraphKit } from '../mod.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test('Execute graph with multiple nodes', async () => {
  const graph = GraphKit.createGraph();
  
  graph.registerNodeType('multiply', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a * inputs.b }),
  });

  const n1 = graph.addNode('multiply', { data: { a: 3, b: 4 } });
  const n2 = graph.addNode('multiply', { data: { b: 2 } });
  
  graph.addEdge({
    sourceNodeId: n1.id,
    sourcePortId: 'result',
    targetNodeId: n2.id,
    targetPortId: 'a',
  });

  const result = await graph.execute();
  assertEquals(result.values.get(`${n2.id}.result`), 24); // 3*4=12, 12*2=24
});

Deno.test('Graph validation detects cycles', () => {
  const graph = GraphKit.createGraph();
  
  graph.registerNodeType('pass', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async (inputs: any) => ({ output: inputs.input }),
  });

  const n1 = graph.addNode('pass');
  const n2 = graph.addNode('pass');
  
  graph.addEdge({
    sourceNodeId: n1.id,
    sourcePortId: 'output',
    targetNodeId: n2.id,
    targetPortId: 'input',
  });
  graph.addEdge({
    sourceNodeId: n2.id,
    sourcePortId: 'output',
    targetNodeId: n1.id,
    targetPortId: 'input',
  });

  const errors = graph.validate();
  assertEquals(errors.length > 0, true);
});
