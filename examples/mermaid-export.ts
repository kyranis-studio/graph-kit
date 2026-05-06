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
console.log(`\n${color(Colors.line.repeat(60), Colors.gray)}`);
console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgTeal + Colors.white)} ${bold(color('MERMAID EXPORT', Colors.sky))}`);
console.log(color(Colors.line.repeat(60), Colors.dim));

console.log(`${color('```mermaid', Colors.dim)}`);
console.log(color(graph.toMermaid(), Colors.silver));
console.log(`${color('```', Colors.dim)}\n`);

// Also generate DOT format
console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('DOT EXPORT', Colors.sky))}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
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
  console.log(`\n  ${color(Colors.check, Colors.teal)} ${color('Saved to', Colors.dim)} ${color('graph-diagram.md', Colors.teal)}`);

  // Also save raw mermaid
  await Deno.writeTextFile('graph-diagram.mmd', graph.toMermaid());
  console.log(`  ${color(Colors.check, Colors.teal)} ${color('Saved raw Mermaid to', Colors.dim)} ${color('graph-diagram.mmd', Colors.teal)}`);
} catch (error) {
  if (error instanceof Deno.errors.PermissionDenied) {
    console.log(`\n  ${color(Colors.warn, Colors.gold)} ${color('To save files, run with:', Colors.dim)} ${color('deno run --allow-read --allow-write examples/mermaid-export.ts', Colors.sky)}`);
  }
}

// Execute the graph to show it works
console.log(`\n${color(Colors.line.repeat(60), Colors.gray)}`);
console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('EXECUTION', Colors.sky))}`);
console.log(color(Colors.line.repeat(60), Colors.dim));

const result = await graph.execute();

console.log(`\n${color(Colors.line.repeat(60), Colors.dim)}`);
console.log(`${color(' RESULTS ', Colors.bold + Colors.bgTeal + Colors.white)}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
console.log(`  ${color(Colors.bullet, Colors.sky)} ${color('Source output:', Colors.dim)} ${color(result.values.get('source.value'), Colors.silver)}`);
console.log(`  ${color(Colors.bullet, Colors.sky)} ${color('Process1 output:', Colors.dim)} ${color(result.values.get('process1.output'), Colors.silver)}`);
console.log(`  ${color(Colors.bullet, Colors.sky)} ${color('Process2 output:', Colors.dim)} ${color(result.values.get('process2.output'), Colors.silver)}`);
console.log(color(Colors.line.repeat(60), Colors.dim) + '\n');
