import { GraphKit } from '../mod.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { toMermaid, toDOT } from '../src/utils/export.ts';

Deno.test('toMermaid generates correct format', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.addNode('add', { id: 'n1' });
  graph.addNode('add', { id: 'n2' });
  graph.addEdge({
    sourceNodeId: 'n1',
    sourcePortId: 'result',
    targetNodeId: 'n2',
    targetPortId: 'a',
  });

  const result = toMermaid(graph);
  assertEquals(result.startsWith('graph TD'), true);
  assertEquals(result.includes('n1'), true);
  assertEquals(result.includes('n2'), true);
  assertEquals(result.includes('-->'), true);
});

Deno.test('toDOT generates correct format', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('add', {
    inputs: [
      { id: 'a', name: 'A', type: 'number', required: true },
      { id: 'b', name: 'B', type: 'number', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', required: false }],
    execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
  });

  graph.addNode('add', { id: 'n1' });

  const result = toDOT(graph);
  assertEquals(result.startsWith('digraph G'), true);
  assertEquals(result.includes('n1'), true);
  assertEquals(result.endsWith('}'), true);
});

Deno.test('toMermaid with labels', () => {
  const graph = GraphKit.createGraph();
  graph.registerNodeType('chat', {
    inputs: [{ id: 'p', name: 'P', type: 'string', required: true }],
    outputs: [{ id: 'r', name: 'R', type: 'string', required: false }],
    execute: async (inputs: any) => ({ r: inputs.p }),
    metadata: { label: 'Chat Node' },
  });

  graph.addNode('chat', { id: 'chat1', metadata: { label: 'My Chat' } });

  const result = toMermaid(graph);
  assertEquals(result.includes('My Chat'), true);
});

Deno.test('export handles empty graph', () => {
  const graph = GraphKit.createGraph();
  assertEquals(toMermaid(graph), 'graph TD\n');
  assertEquals(toDOT(graph), 'digraph G {\n}');
});
