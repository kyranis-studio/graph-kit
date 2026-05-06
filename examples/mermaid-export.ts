import { GraphKit } from '../mod.ts';
import { Colors, color } from '../src/utils/colors.ts';

const graph = GraphKit.createGraph({ metadata: { name: 'Mermaid Export Example' } });

// Register node types
graph.registerNodeType('input', {
  inputs: [],
  outputs: [
    { id: 'value', name: 'Value', type: 'string', required: false },
  ],
  execute: async (inputs: any) => ({ value: inputs.value || 'default' }),
});

graph.registerNodeType('process', {
  inputs: [
    { id: 'input', name: 'Input', type: 'string', required: true },
  ],
  outputs: [
    { id: 'output', name: 'Output', type: 'string', required: false },
  ],
  execute: async (inputs: any) => ({ output: `[${inputs.input}]` }),
});

graph.registerNodeType('output', {
  inputs: [
    { id: 'input', name: 'Input', type: 'string', required: true },
  ],
  outputs: [],
  execute: async () => ({}),
});

// Add nodes with custom IDs for better Mermaid output
const sourceNode = graph.addNode('input', { 
  id: 'source',
  data: { value: 'Hello World' },
  metadata: { label: 'Source', color: '#4CAF50' }
});

const process1 = graph.addNode('process', { 
  id: 'process1',
  metadata: { label: 'Process 1', color: '#2196F3' }
});

const process2 = graph.addNode('process', { 
  id: 'process2',
  metadata: { label: 'Process 2', color: '#2196F3' }
});

const finalOutput = graph.addNode('output', { 
  id: 'final',
  metadata: { label: 'Final Output', color: '#FF5722' }
});

// Connect nodes (source -> process1 -> process2 -> final)
graph.addEdge({
  sourceNodeId: 'source',
  sourcePortId: 'value',
  targetNodeId: 'process1',
  targetPortId: 'input',
});

graph.addEdge({
  sourceNodeId: 'process1',
  sourcePortId: 'output',
  targetNodeId: 'process2',
  targetPortId: 'input',
});

graph.addEdge({
  sourceNodeId: 'process2',
  sourcePortId: 'output',
  targetNodeId: 'final',
  targetPortId: 'input',
});

// Generate Mermaid diagram
console.log(color('=== Mermaid Diagram ===', Colors.teal));
console.log(color('Copy and paste into https://mermaid.live or a Markdown file:\n', Colors.dim));
console.log('```mermaid');
console.log(color(graph.toMermaid(), Colors.silver));
console.log('```\n');

// Also generate DOT format
console.log(color('=== DOT Graph (for Graphviz) ===', Colors.teal));
console.log(color(graph.toDOT(), Colors.silver));

// Save to file if write permission is available
try {
  const mermaidOutput = `# GraphKit Mermaid Example

## Graph: ${graph.metadata?.name || 'Untitled'}

\`\`\`mermaid
${graph.toMermaid()}
\`\`\`

## DOT Format

\`\`\`dot
${graph.toDOT()}
\`\`\`
`;

  await Deno.writeTextFile('graph-diagram.md', mermaidOutput);
  console.log(color('\nSaved to graph-diagram.md', Colors.teal));

  // Also save raw mermaid
  await Deno.writeTextFile('graph-diagram.mmd', graph.toMermaid());
  console.log(color('Saved raw Mermaid to graph-diagram.mmd', Colors.teal));
} catch (error) {
  if (error instanceof Deno.errors.PermissionDenied) {
    console.log(color('\nTo save files, run with:', Colors.dim), color('deno run --allow-read --allow-write examples/mermaid-export.ts', Colors.sky));
  }
}

// Execute the graph to show it works
console.log(color('\n=== Executing Graph ===', Colors.teal));
const result = await graph.execute();
console.log(color('Execution complete!', Colors.teal));
console.log(color('Source output:', Colors.dim), result.values.get('source.value'));
console.log(color('Process1 output:', Colors.dim), result.values.get('process1.output'));
console.log(color('Process2 output:', Colors.dim), result.values.get('process2.output'));
