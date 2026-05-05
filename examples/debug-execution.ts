import { GraphKit } from '../mod.ts';
import { DebugExecutionEngine } from '../src/execution/debug-engine.ts';

const graph = GraphKit.createGraph({ metadata: { name: 'Debug Example' } });

// Register node types
graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'number' },
  ],
  execute: async (inputs) => ({
    result: (inputs as any).a + (inputs as any).b,
  }),
});

graph.registerNodeType('multiply', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'number' },
  ],
  execute: async (inputs) => ({
    result: (inputs as any).a * (inputs as any).b,
  }),
  metadata: { label: 'Multiply Node' },
});

graph.registerNodeType('log', {
  inputs: [
    { id: 'value', name: 'Value', type: 'any', required: true },
  ],
  outputs: [
    { id: 'value', name: 'Value', type: 'any' },
  ],
  execute: async (inputs) => ({
    value: inputs.value,
  }),
  metadata: { label: 'Logger' },
});

// Build graph: (5 + 3) -> multiply by 2 -> log result
const n1 = graph.addNode('add', { id: 'add1', data: { a: 5, b: 3 }, metadata: { label: 'Add 5 + 3' } });
const n2 = graph.addNode('multiply', { id: 'mul1', data: { b: 2 } });
const n3 = graph.addNode('log', { id: 'log1' });

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: 'result',
  targetNodeId: n2.id,
  targetPortId: 'a',
});

graph.addEdge({
  sourceNodeId: n2.id,
  sourcePortId: 'result',
  targetNodeId: n3.id,
  targetPortId: 'value',
});

// Validate graph
const errors = graph.validate();
if (errors.length > 0) {
  console.error('Graph validation errors:', errors);
  Deno.exit(1);
}

// Create debug engine with step mode enabled
const debugEngine = new DebugExecutionEngine({
  stepMode: true,
  onNodeStart: (info) => {
    // Custom hook - could send to monitoring service
    console.log(`[HOOK] Starting node: ${info.nodeId}`);
  },
  onNodeComplete: (info) => {
    console.log(`[HOOK] Completed node: ${info.nodeId} (${info.duration?.toFixed(2)}ms)`);
  },
  onNodeError: (info) => {
    console.error(`[HOOK] Error in node: ${info.nodeId}`, info.error);
  },
});

// Optional: also use middleware for timing
graph.use(async (context, next) => {
  const start = Date.now();
  await next();
  console.log(`[MIDDLEWARE] ${context.nodeId} total: ${Date.now() - start}ms`);
});

// Execute with debug engine
const result = await debugEngine.execute(graph);

console.log('\nFinal state:');
for (const [key, value] of result.values) {
  console.log(`  ${key}: ${value}`);
}

console.log('\nExecution log:');
for (const entry of debugEngine.executionLog) {
  console.log(`  ${entry.nodeId} (${entry.nodeType}): ${entry.status}`);
}
