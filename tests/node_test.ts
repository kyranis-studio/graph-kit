import { GraphKit } from '../mod.ts';
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test('Node has correct structure', () => {
  const graph = GraphKit.createGraph();
  
  graph.registerNodeType('test', {
    inputs: [
      { id: 'input1', name: 'Input 1', type: 'string', required: true },
    ],
    outputs: [
      { id: 'output1', name: 'Output 1', type: 'string', required: false },
    ],
    execute: async (inputs: any) => ({ output1: inputs.input1 }),
  });

  const node = graph.addNode('test', { data: { input1: 'hello' } });
  
  assertEquals(node.type, 'test');
  assertEquals(node.data.input1, 'hello');
  assertExists(node.inputs.get('input1'));
  assertExists(node.outputs.get('output1'));
});

Deno.test('Update node data', () => {
  const graph = GraphKit.createGraph();
  
  graph.registerNodeType('test', {
    inputs: [{ id: 'input1', name: 'Input 1', type: 'string', required: true }],
    outputs: [{ id: 'output1', name: 'Output 1', type: 'string', required: false }],
    execute: async (inputs: any) => ({ output1: inputs.input1 }),
  });

  const node = graph.addNode('test', { data: { input1: 'hello' } });
  graph.updateNodeData(node.id, { input1: 'world' });
  
  assertEquals(node.data.input1, 'world');
});
