import { GraphKit } from '../mod.ts';

const graph = GraphKit.createGraph({ name: 'RAG Pipeline' });

graph.registerNodeType('ingest', {
  inputs: [{ id: 'docs', name: 'Documents', type: 'string', required: true }],
  outputs: [{ id: 'chunks', name: 'Chunks', type: 'array' }],
  execute: async (inputs: any) => ({
    chunks: (inputs.docs as string).split('.').filter(Boolean),
  }),
});

graph.registerNodeType('embed', {
  inputs: [{ id: 'text', name: 'Text', type: 'string', required: true }],
  outputs: [{ id: 'vector', name: 'Vector', type: 'array' }],
  execute: async () => ({ vector: [0.1, 0.2, 0.3] }),
});

graph.registerNodeType('route', {
  inputs: [{ id: 'query', name: 'Query', type: 'string', required: true }],
  outputs: [{ id: 'type', name: 'Type', type: 'string' }],
  execute: async (inputs: any) => ({
    type: (inputs.query as string).includes('?') ? 'search' : 'generate',
  }),
});

graph.registerNodeType('search', {
  inputs: [{ id: 'query', name: 'Query', type: 'string', required: true }],
  outputs: [{ id: 'results', name: 'Results', type: 'array' }],
  execute: async () => ({ results: ['result1', 'result2'] }),
});

graph.registerNodeType('generate', {
  inputs: [
    { id: 'context', name: 'Context', type: 'string', required: true },
    { id: 'query', name: 'Query', type: 'string', required: true },
  ],
  outputs: [{ id: 'answer', name: 'Answer', type: 'string' }],
  execute: async (inputs: any) => ({
    answer: `Based on context, answer: ${inputs.query}`,
  }),
});

graph.addNode('ingest', { id: 'doc-ingest' });
graph.addNode('embed', { id: 'doc-embed' });
graph.addNode('route', { id: 'query-router' });
graph.addNode('search', { id: 'vector-search' });
graph.addNode('generate', { id: 'llm-generate' });

graph.addEdge({
  sourceNodeId: 'doc-ingest',
  sourcePortId: 'chunks',
  targetNodeId: 'doc-embed',
  targetPortId: 'text',
});

console.log('\n--- RAG Pipeline Mermaid ---');
console.log(graph.toMermaid());
console.log('\n--- RAG Pipeline DOT ---');
console.log(graph.toDOT());
