# GraphKit - Node Graph Library for Deno 2

GraphKit is a lightweight, TypeScript-first library for building node graph applications in Deno 2. It provides the computational layer for creating, connecting, and executing node-based workflows.

## Features

- **Node System**: Typed units with inputs, outputs, and execution logic
- **Port System**: Type-safe data flow between nodes
- **Edge System**: Connect output ports to input ports
- **Execution Engine**: Sequential, event-driven, and AI workflow execution modes
- **State Management**: State flows through edges with checkpoint support
- **TypeScript Support**: Full TypeScript support with generics
- **Deno 2 Native**: Pure ESM modules, no external dependencies

## Installation

```typescript
import { GraphKit } from 'jsr:@graph-kit/core';
```

Or use locally:

```typescript
import { GraphKit } from './mod.ts';
```

## Quick Start

```typescript
import { GraphKit } from './mod.ts';

const graph = GraphKit.createGraph({ metadata: { name: 'My Workflow' } });

// Define a simple math node
graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'number', required: false },
  ],
  execute: async (inputs) => ({
    result: inputs.a + inputs.b,
  }),
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
console.log(result.values);
```

## API Documentation

### Creating a Graph

```typescript
const graph = GraphKit.createGraph({ metadata: { name: 'My Graph' } });
```

### Registering Node Types

```typescript
graph.registerNodeType('node-type', {
  inputs: [{ id: 'input1', name: 'Input 1', type: 'string', required: true }],
  outputs: [{ id: 'output1', name: 'Output 1', type: 'string', required: false }],
  execute: async (inputs) => ({ output1: inputs.input1 }),
});
```

### Adding Nodes and Edges

```typescript
const node = graph.addNode('node-type', { data: { input1: 'value' } });

graph.addEdge({
  sourceNodeId: node1.id,
  sourcePortId: 'output1',
  targetNodeId: node2.id,
  targetPortId: 'input1',
});
```

### Execution

```typescript
// Sequential execution
const result = await graph.execute();

// Workflow (AI-style) execution
const workflow = graph.createWorkflow({
  startNode: 'start',
  endNode: 'end',
});

await workflow.run();
```

### Querying

```typescript
const predecessors = graph.getPredecessors(nodeId);
const successors = graph.getSuccessors(nodeId);
const errors = graph.validate();
```

### Serialization

```typescript
const json = graph.toJSON();
const restored = GraphKit.fromJSON(json);
```

### Visualization

```typescript
const mermaid = graph.toMermaid();
const dot = graph.toDOT();

// Example Mermaid output:
// graph TD
//   node1[add]
//   node2[multiply]
//   node1 --> node2
```

See `examples/mermaid-export.ts` for a complete example that generates diagrams you can view at https://mermaid.live.

## Testing

```bash
deno test --allow-read tests/
```

## License

MIT
