import { GraphKit } from '../mod.ts';
import { Colors, color } from '../src/utils/colors.ts';

const graph = GraphKit.createGraph({ metadata: { name: 'AI Workflow - RAG Pipeline' } });

// Register node types for AI workflow
graph.registerNodeType('input', {
  inputs: [],
  outputs: [{ id: 'query', name: 'Query', type: 'string', required: false }],
  execute: async (inputs: any) => ({ query: inputs.query || 'default query' }),
});

graph.registerNodeType('ollama-chat', {
  inputs: [
    { id: 'prompt', name: 'Prompt', type: 'string', required: true },
    { id: 'model', name: 'Model', type: 'string', required: false, defaultValue: 'llama3' },
    { id: 'systemPrompt', name: 'System Prompt', type: 'string', required: false },
  ],
  outputs: [{ id: 'response', name: 'Response', type: 'string', required: false }],
  execute: async (inputs: any) => ({ 
    response: `[Simulated Ollama response for: ${inputs.prompt}]` 
  }),
});

graph.registerNodeType('decision', {
  inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
  outputs: [
    { id: 'technical', name: 'Technical', type: 'string', required: false },
    { id: 'general', name: 'General', type: 'string', required: false },
  ],
  execute: async (inputs: any) => {
    if (inputs.input.toLowerCase().includes('code') || inputs.input.toLowerCase().includes('programming')) {
      return { technical: inputs.input, general: null };
    }
    return { general: inputs.input, technical: null };
  },
});

graph.registerNodeType('output', {
  inputs: [{ id: 'input', name: 'Input', type: 'string', required: true }],
  outputs: [],
  execute: async () => ({}),
});

// Build the RAG pipeline graph
const startNode = graph.addNode('input', { 
  id: 'start',
  data: { query: 'What is TypeScript?' },
  metadata: { label: 'User Query', color: '#4CAF50' }
});

const rewriteNode = graph.addNode('ollama-chat', { 
  id: 'rewrite-query',
  data: { 
    systemPrompt: 'Rewrite the query for better search results',
    model: 'llama3'
  },
  metadata: { label: 'Rewrite Query', color: '#2196F3' }
});

const decisionNode = graph.addNode('decision', { 
  id: 'router',
  metadata: { label: 'Route Query', color: '#FF9800' }
});

const techAgent = graph.addNode('ollama-chat', { 
  id: 'tech-agent',
  data: { 
    systemPrompt: 'You are a technical expert',
    model: 'llama3'
  },
  metadata: { label: 'Technical Agent', color: '#9C27B0' }
});

const generalAgent = graph.addNode('ollama-chat', { 
  id: 'general-agent',
  data: { 
    systemPrompt: 'You are a helpful assistant',
    model: 'llama3'
  },
  metadata: { label: 'General Agent', color: '#00BCD4' }
});

const finalOutput = graph.addNode('output', { 
  id: 'end',
  metadata: { label: 'Final Output', color: '#FF5722' }
});

// Connect the graph
graph.addEdge({ sourceNodeId: 'start', sourcePortId: 'query', targetNodeId: 'rewrite-query', targetPortId: 'prompt' });
graph.addEdge({ sourceNodeId: 'rewrite-query', sourcePortId: 'response', targetNodeId: 'router', targetPortId: 'input' });

// Router branches
graph.addEdge({ sourceNodeId: 'router', sourcePortId: 'technical', targetNodeId: 'tech-agent', targetPortId: 'prompt' });
graph.addEdge({ sourceNodeId: 'router', sourcePortId: 'general', targetNodeId: 'general-agent', targetPortId: 'prompt' });

// Both agents feed into final output
graph.addEdge({ sourceNodeId: 'tech-agent', sourcePortId: 'response', targetNodeId: 'end', targetPortId: 'input' });
graph.addEdge({ sourceNodeId: 'general-agent', sourcePortId: 'response', targetNodeId: 'end', targetPortId: 'input' });

// Generate and display Mermaid diagram
console.log(`\n${color(Colors.line.repeat(60), Colors.gray)}`);
console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgTeal + Colors.white)} ${bold(color('MERMAID EXPORT', Colors.sky))}`);
console.log(color(Colors.line.repeat(60), Colors.dim));

console.log(`${color('```mermaid', Colors.dim)}`);
console.log(color(graph.toMermaid(), Colors.silver));
console.log(`${color('```', Colors.dim)}\n`);

// Save to files
try {
  const markdown = `# AI Workflow - RAG Pipeline

This is a visualization of an AI workflow that:
1. Takes a user query
2. Rewrites it for better search
3. Routes to specialized agents (technical vs general)
4. Combines results

## Mermaid Diagram

\`\`\`mermaid
${graph.toMermaid()}
\`\`\`

## DOT Diagram

\`\`\`dot
${graph.toDOT()}
\`\`\`
`;

  await Deno.writeTextFile('rag-pipeline.md', markdown);
  console.log(`  ${color(Colors.check, Colors.teal)} ${color('Saved visualization to', Colors.dim)} ${color('rag-pipeline.md', Colors.teal)}`);
  console.log(`  ${color(Colors.bullet, Colors.gray)} ${color('View it at:', Colors.dim)} ${color('https://mermaid.live', Colors.sky)}`);
} catch (error) {
  if (error instanceof Deno.errors.PermissionDenied) {
    console.log(`  ${color(Colors.warn, Colors.gold)} ${color('To save files, run with:', Colors.dim)} ${color('deno run --allow-read --allow-write examples/mermaid-complex.ts', Colors.sky)}`);
  }
}

// Execute the graph
console.log(`\n${color(Colors.line.repeat(60), Colors.gray)}`);
console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('EXECUTION', Colors.sky))}`);
console.log(color(Colors.line.repeat(60), Colors.dim));

const result = await graph.execute();

console.log(`\n${color(Colors.line.repeat(60), Colors.dim)}`);
console.log(`${color(' RESULTS ', Colors.bold + Colors.bgTeal + Colors.white)}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
console.log(`  ${color(Colors.bullet, Colors.sky)} ${color('Start query:', Colors.dim)} ${color(result.values.get('start.query'), Colors.silver)}`);
console.log(`  ${color(Colors.bullet, Colors.sky)} ${color('Rewritten:', Colors.dim)} ${color(result.values.get('rewrite-query.response'), Colors.silver)}`);
console.log(color(Colors.line.repeat(60), Colors.dim) + '\n');
