# GraphKit - Node Graph Library for Deno 2

## Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** May 4, 2026  
**Status:** Draft

---

## 1. Overview

GraphKit is a lightweight, TypeScript-first library for building node graph applications in Deno 2. It provides the computational layer for creating, connecting, and executing node-based workflows, with primary focus on AI workflows while remaining general-purpose.

### 1.1 Inspiration

- **LangGraph**: State-based execution, conditional edges, cycles support
- **statelyai/graph**: Plain JSON graphs, port system for node-editor style graphs
- **@codemix/graph**: Type-safe graph database patterns

---

## 2. Core Features

### 2.1 Node System

#### 2.1.1 Node Definition
- Nodes are typed units with unique identifiers
- Each node has a type, inputs, outputs, and execution logic
- Nodes can be created dynamically or from registered types

```typescript
interface Node {
  id: string;
  type: string;
  inputs: Map<string, Port>;
  outputs: Map<string, Port>;
  data: Record<string, unknown>;
  metadata?: NodeMetadata;
}

interface NodeMetadata {
  label?: string;
  description?: string;
  category?: string;
  color?: string;
  position?: { x: number; y: number };
}
```

#### 2.1.2 Port System
- **Input Ports**: Receive data from incoming edges
- **Output Ports**: Send data to outgoing edges
- Ports have typed data (using TypeScript generics)
- Support for required/optional ports

```typescript
interface Port {
  id: string;
  name: string;
  type: PortType;
  required: boolean;
  defaultValue?: unknown;
  schema?: SchemaValidator; // Zod, Valibot, or custom
}

type PortType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any' | string;
```

### 2.2 Edge System

#### 2.2.1 Edge Definition
- Connect output ports to input ports
- Support for one-to-one and one-to-many connections
- Edges carry data between nodes

```typescript
interface Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  metadata?: EdgeMetadata;
}

interface EdgeMetadata {
  label?: string;
  color?: string;
  animated?: boolean;
}
```

#### 2.2.2 Connection Rules
- Type checking: Output port type must be compatible with input port type
- Prevent cycles (optional, configurable)
- Allow/disallow multiple connections to same input port (configurable)

### 2.3 Graph Structure

#### 2.3.1 Graph Container
- Contains nodes and edges
- Plain JSON-serializable object
- Supports hierarchical/sub-graphs (optional, future)

```typescript
interface Graph {
  id: string;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  metadata?: GraphMetadata;
}
```

#### 2.3.2 Graph Operations
- `addNode(type, config?)`: Create and add a node
- `removeNode(nodeId)`: Remove node and connected edges
- `addEdge(connection)`: Connect two ports
- `removeEdge(edgeId)`: Remove an edge
- `getNode(nodeId)`: Retrieve a node
- `getEdgesForNode(nodeId)`: Get all edges connected to a node
- `getIncomers(nodeId)`: Get nodes that feed into a node
- `getOutgoers(nodeId)`: Get nodes that receive data from a node

### 2.4 Execution Engine

#### 2.4.1 Node Execution
- Nodes define an `execute` function
- Function receives input values and returns output values
- Support for async execution

```typescript
type NodeExecutor<TInput = unknown, TOutput = unknown> = (
  inputs: TInput,
  context: ExecutionContext
) => Promise<TOutput> | TOutput;

interface ExecutionContext {
  graph: Graph;
  nodeId: string;
  state: GraphState;
  config?: Record<string, unknown>;
}
```

#### 2.4.2 Graph Execution Modes

**Sequential Execution** (default):
- Execute nodes in topological order
- Wait for all inputs to be available
- Support for parallel execution of independent nodes

**Event-Driven Execution**:
- Nodes trigger execution when inputs arrive
- Support for cycles and loops

**AI Workflow Execution** (LangGraph-inspired):
- State-based execution
- Conditional edges (routing based on state)
- Support for `START` and `END` special nodes
- Human-in-the-loop (pause/resume)

```typescript
interface GraphState {
  values: Map<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}
```

#### 2.4.3 Execution Control
- `execute(graph, initialState?)`: Run the graph
- `pause()`: Pause execution
- `resume()`: Resume from pause point
- `cancel()`: Cancel execution
- Event emission for execution lifecycle (nodeStart, nodeComplete, graphComplete)

### 2.5 State Management

#### 2.5.1 State Flow
- State flows through edges
- Nodes read from input ports, write to output ports
- State can be accumulated or replaced (configurable)

#### 2.5.2 Persistence (Optional)
- Checkpoint state at each step
- Resume from any checkpoint
- In-memory or custom storage backend

```typescript
interface StateStore {
  save(checkpoint: Checkpoint): Promise<void>;
  load(graphId: string): Promise<Checkpoint | null>;
  list(graphId: string): Promise<Checkpoint[]>;
}
```

---

## 3. API Design

### 3.1 Creating a Graph

```typescript
import { GraphKit } from '@graph-kit/core';

// Create a new graph
const graph = GraphKit.createGraph({ name: 'My Workflow' });

// Register node types
graph.registerNodeType('llm-call', {
  inputs: [
    { id: 'prompt', name: 'Prompt', type: 'string', required: true },
    { id: 'model', name: 'Model', type: 'string', default: 'gpt-4' }
  ],
  outputs: [
    { id: 'response', name: 'Response', type: 'string' }
  ],
  execute: async (inputs) => {
    const response = await callLLM(inputs.prompt, inputs.model);
    return { response };
  }
});

// Create nodes
const node1 = graph.addNode('llm-call', { 
  data: { prompt: 'Hello, world!' } 
});

const node2 = graph.addNode('llm-call', {
  data: { prompt: 'Follow up question' }
});

// Connect nodes
graph.addEdge({
  sourceNodeId: node1.id,
  sourcePortId: 'response',
  targetNodeId: node2.id,
  targetPortId: 'prompt'
});
```

### 3.2 Executing a Graph

```typescript
// Sequential execution
const result = await graph.execute({
  initialState: { values: new Map() }
});

// With state updates
graph.on('nodeComplete', (event) => {
  console.log(`Node ${event.nodeId} completed`);
  console.log('Output:', event.output);
});

// AI Workflow style with conditional routing
const workflow = graph.createWorkflow({
  startNode: 'start',
  endNode: 'end',
  onStateUpdate: (state) => console.log('State updated:', state)
});

await workflow.run();
```

### 3.3 Querying and Inspection

```typescript
// Get graph structure
const nodes = graph.getNodes();
const edges = graph.getEdges();

// Find connected nodes
const predecessors = graph.getPredecessors(nodeId);
const successors = graph.getSuccessors(nodeId);

// Validate graph
const errors = graph.validate();
if (errors.length > 0) {
  console.error('Graph has errors:', errors);
}

// Serialization
const json = graph.toJSON();
const restored = GraphKit.fromJSON(json);
```

---

## 4. Advanced Features

### 4.1 Conditional Edges (AI Workflows)
```typescript
graph.addConditionalEdge({
  sourceNodeId: 'router',
  condition: (state) => {
    if (state.values.get('category') === 'technical') {
      return 'technical-agent';
    }
    return 'general-agent';
  }
});
```

### 4.2 Subgraphs
- Nest graphs within nodes
- Encapsulate complex logic
- Reusable graph components

### 4.3 Middleware/Interceptors
```typescript
graph.use(async (context, next) => {
  console.log(`Executing node: ${context.nodeId}`);
  const start = Date.now();
  await next();
  console.log(`Completed in ${Date.now() - start}ms`);
});
```

### 4.4 Schema Validation
- Optional schema validation using Standard Schema (Zod, Valibot, ArkType)
- Validate port types at connection time
- Validate node data against schema

### 4.5 Visualization Helpers
- Export to various formats (Mermaid, DOT, JSON)
- Layout hints for UI rendering
- Position and styling metadata

```typescript
// Export for visualization
const mermaid = graph.toMermaid();
const dot = graph.toDOT();
```

---

## 5. Non-Functional Requirements

### 5.1 Performance
- Efficient graph traversal algorithms (BFS, DFS, topological sort)
- Lazy evaluation where possible
- Support for large graphs (1000+ nodes)

### 5.2 TypeScript Support
- Full TypeScript support with generics
- Type-safe node definitions
- IntelliSense for node inputs/outputs

### 5.3 Deno 2 Compatibility
- Pure ESM modules
- No external dependencies (or minimal)
- Works with Deno permissions model
- Follow Deno style guide (mod.ts entry, JSDoc docs)

### 5.4 Serialization
- Graphs are JSON-serializable
- Support for `structuredClone`
- Custom serialization hooks

### 5.5 Error Handling
- Graceful error propagation
- Node-level error boundaries
- Configurable error strategies (fail-fast, continue, retry)

---

## 6. Project Structure

```
graph-kit/
├── mod.ts                  # Main entry point
├── deno.json              # Deno configuration
├── PRD.md                 # This file
├── README.md              # Documentation
├── src/
│   ├── core/
│   │   ├── graph.ts       # Graph class
│   │   ├── node.ts        # Node class
│   │   ├── edge.ts        # Edge class
│   │   └── port.ts        # Port class
│   ├── execution/
│   │   ├── engine.ts      # Execution engine
│   │   ├── state.ts       # State management
│   │   └── workflow.ts    # Workflow (AI-style)
│   ├── algorithms/
│   │   ├── traversal.ts   # BFS, DFS
│   │   ├── sorting.ts     # Topological sort
│   │   └── validation.ts  # Graph validation
│   ├── types/
│   │   └── index.ts       # TypeScript types
│   └── utils/
│       ├── serialization.ts
│       └── export.ts      # Mermaid, DOT export
├── tests/
│   ├── graph_test.ts
│   ├── node_test.ts
│   ├── execution_test.ts
│   └── workflow_test.ts
└── examples/
    ├── basic-usage.ts
    ├── ai-workflow.ts
    └── custom-nodes.ts
```

---

## 7. Usage Examples

### 7.1 Basic Node Graph

```typescript
import { GraphKit } from '@graph-kit/core';

const graph = GraphKit.createGraph();

// Define a simple math node
graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true }
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'number' }
  ],
  execute: async (inputs) => ({
    result: inputs.a + inputs.b
  })
});

const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
const n2 = graph.addNode('add');

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: 'result',
  targetNodeId: n2.id,
  targetPortId: 'a'
});

// Set n2's b input
graph.updateNodeData(n2.id, { b: 10 });

// Execute
const result = await graph.execute();
console.log(result.values); // { result: 18 } (8 + 10)
```

### 7.2 AI Workflow

```typescript
import { GraphKit } from '@graph-kit/core';

const workflow = GraphKit.createWorkflow({
  name: 'RAG Pipeline'
});

// Nodes
workflow.addNode('rewrite-query', {
  type: 'llm',
  config: { systemPrompt: 'Rewrite for better retrieval...' }
});

workflow.addNode('retrieve', {
  type: 'vector-search',
  config: { topK: 5 }
});

workflow.addNode('generate', {
  type: 'llm',
  config: { systemPrompt: 'Answer using context...' }
});

// Connections
workflow
  .connect('rewrite-query.output', 'retrieve.query')
  .connect('retrieve.documents', 'generate.context')
  .connect('rewrite-query.input', 'START')
  .connect('generate.output', 'END');

// Run
const result = await workflow.run({
  input: 'What is quantum computing?'
});
```

---

## 8. Future Considerations

- Visual editor integration (React Flow, Vue Flow bindings)
- Real-time collaboration (CRDT support)
- Distributed execution
- Hot-reloading of node definitions
- Debugging tools (step-through execution, state inspection)
- Metrics and observability
- Web Worker support for heavy computations
