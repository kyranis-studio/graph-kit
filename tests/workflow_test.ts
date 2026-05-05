import { GraphKit } from '../mod.ts';
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test('Workflow execution', async () => {
  const graph = GraphKit.createGraph();
  
  graph.registerNodeType('start', {
    inputs: [],
    outputs: [{ id: 'output', name: 'Output', type: 'string', required: false }],
    execute: async (inputs: any) => ({ output: 'start' }),
  });

  graph.registerNodeType('end', {
    inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
    outputs: [],
    execute: async (inputs: any) => ({}),
  });

  const workflow = graph.createWorkflow({
    startNode: 'start-node',
    endNode: 'end-node',
  });

  const startNode = graph.addNode('start', { id: 'start-node' });
  const endNode = graph.addNode('end', { id: 'end-node' });

  workflow.connect('start-node.output', 'end-node.input');

  const result = await workflow.run();
  assertEquals(result.values.get('start-node.output'), 'start');
});
