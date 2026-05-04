# GraphKit - Node Graph Library for Deno 2

## Product Requirements Document (PRD)

**Version:** 1.1  
**Date:** May 4, 2026  
**Status:** Updated

---

## 1. Overview

GraphKit is a lightweight, TypeScript-first library for building node graph applications in Deno 2. It provides the computational layer for creating, connecting, and executing node-based workflows, with primary focus on AI workflows while remaining general-purpose.

**Companion AI Inference Library**: GraphKit is accompanied by `@graph-kit/ai`, a lightweight Deno 2 library for abstracting AI model inference. It prioritizes local providers (Ollama) with support for online APIs (OpenAI-compatible endpoints), and provides pre-built GraphKit node types for seamless integration.

### 1.1 Inspiration

- **LangGraph**: State-based execution, conditional edges, cycles support
- **statelyai/graph**: Plain JSON graphs, port system for node-editor style graphs
- **@codemix/graph**: Type-safe graph database patterns
- **Ollama**: Local LLM inference patterns

---

## 2. Core Features

### 2.1 Node System

#### 2.1.1 Node Definition
- Nodes are typed units with unique identifiers
- Each node has a type, inputs, outputs, and execution logic
- Nodes can be created dynamically or from registered types
- Pre-built nodes available via `@graph-kit/ai` for AI workflows

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
- `getPredecessors(nodeId)`: Get nodes that feed into a node
- `getSuccessors(nodeId)`: Get nodes that receive data from a node

### 2.4 Execution Engine

#### 2.4.1 Node Execution
- Nodes define an `execute` function
- Function receives input values and returns output values
- Support for async execution
- `@graph-kit/ai` provides pre-implemented executors for AI nodes

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
import { registerOllamaNodes } from '@graph-kit/ai';

// Create a new graph
const graph = GraphKit.createGraph({ name: 'My Workflow' });

// Register AI nodes from @graph-kit/ai (no custom executor code needed)
registerOllamaNodes(graph);

// Create AI nodes directly
const node1 = graph.addNode('ollama-chat', { 
  data: { 
    model: 'llama3',
    prompt: 'Hello, world!',
    temperature: 0.7
  } 
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
├── mod.ts                  # Main entry point (@graph-kit/core)
├── ai/                     # @graph-kit/ai inference library
│   ├── mod.ts              # AI library entry
│   ├── providers/          # Provider implementations
│   │   ├── base.ts         # Base provider interface
│   │   ├── ollama.ts       # Ollama local provider
│   │   ├── openai.ts       # OpenAI-compatible provider
│   │   └── types.ts        # Provider types
│   ├── nodes/              # Pre-built GraphKit nodes
│   │   ├── ollama-chat.ts
│   │   ├── openai-chat.ts
│   │   └── ai-embedding.ts
│   └── tests/
├── deno.json              # Deno configuration
├── PRD.md                 # This file
├── README.md              # Documentation
├── src/                   # Core GraphKit source
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
├── tests/                 # Core tests
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

### 8.1 Basic Node Graph

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

### 8.2 AI Workflow (RAG Pipeline)

```typescript
import { GraphKit } from '@graph-kit/core';
import { registerOllamaNodes, registerOpenAINodes } from '@graph-kit/ai';

const workflow = GraphKit.createWorkflow({
  name: 'RAG Pipeline'
});

// Register AI nodes
registerOllamaNodes(workflow);
registerOpenAINodes(workflow);

// Nodes
workflow.addNode('ollama-chat', {
  id: 'rewrite-query',
  data: { 
    model: 'llama3',
    systemPrompt: 'Rewrite for better retrieval...' 
  }
});

workflow.addNode('retrieve', {
  id: 'retrieve',
  type: 'vector-search',
  config: { topK: 5 }
});

workflow.addNode('openai-chat', {
  id: 'generate',
  data: { 
    model: 'gpt-4',
    systemPrompt: 'Answer using context...' 
  }
});

// Connections
workflow
  .connect('START', 'rewrite-query.input')
  .connect('rewrite-query.response', 'retrieve.query')
  .connect('retrieve.documents', 'generate.context')
  .connect('generate.response', 'END');

// Run
const result = await workflow.run({
  input: 'What is quantum computing?'
});
```

### 8.3 Local Ollama Integration

```typescript
import { GraphKit } from '@graph-kit/core';
import { registerOllamaNodes } from '@graph-kit/ai';

const graph = GraphKit.createGraph({ name: 'Local AI Workflow' });

// Register Ollama nodes
registerOllamaNodes(graph);

// Add Ollama chat node
const chatNode = graph.addNode('ollama-chat', {
  data: {
    model: 'llama3',
    prompt: 'Explain Deno 2 in simple terms',
    temperature: 0.5,
    maxTokens: 500
  }
});

// Execute with local Ollama
const result = await graph.execute();
console.log(result.values.get('response'));
```

---



## 8. Future Considerations

### Core GraphKit
- Visual editor integration (React Flow, Vue Flow bindings)
- Real-time collaboration (CRDT support)
- Distributed execution
- Hot-reloading of node definitions
- Debugging tools (step-through execution, state inspection)
- Metrics and observability
- Web Worker support for heavy computations

### AI Inference Library
- More local providers (LM Studio, GPT4All, MLC-LLM)
- Multimodal support (image/audio inputs)
- Automatic Ollama model downloading
- Cost tracking for online APIs
- Batch inference support
- Fine-tuning workflow nodes
- Embedding similarity search nodes
- Tool calling UI integration

---

## 9. AI Inference Library Specification (@graph-kit/ai)

### 11.1 Overview
Lightweight, zero-bloat AI model inference abstraction for Deno 2 that integrates seamlessly with GraphKit.

### 11.2 Supported Providers
| Provider | Type | Features |
|----------|------|----------|
| Ollama | Local | Chat, Completions, Embeddings, Streaming |
| OpenAI | Online | Chat, Completions, Embeddings, Tool Calling |
| Groq | Online | Fast inference, Chat, Completions |
| OpenRouter | Online | Multi-model access |

### 11.3 Core Features
- Unified `ChatModel` interface for all providers
- Type-safe request/response objects
- Streaming support (Server-Sent Events)
- Tool/function calling for agent workflows
- Embeddings generation
- Model listing and capability detection
- Minimal dependencies (uses Deno's built-in fetch)

### 11.4 Integration with GraphKit
- Exports pre-built node types: `ollama-chat`, `openai-chat`, `ai-embedding`
- Nodes automatically conform to GraphKit's port system:
  - Inputs: `prompt`, `model`, `temperature`, `systemPrompt`
  - Outputs: `response`, `tokens`, `usage`
- No custom `execute` functions required
- Works with all GraphKit execution modes

### 11.5 AI Library API

```typescript
import { createOllamaProvider } from '@graph-kit/ai/providers/ollama';
import { ChatModel } from '@graph-kit/ai';

// Create Ollama provider
const ollama = createOllamaProvider({
  baseUrl: 'http://localhost:11434'
});

// Use directly (without GraphKit)
const response = await ollama.chat({
  model: 'llama3',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: false
});

// Or get GraphKit node type
const ollamaChatNode = ollama.getGraphKitNodeType();
```

### 11.6 Non-Functional Requirements
- Deno 2 native, no Node.js dependencies
- Minimal footprint: <50KB gzipped
- Works with Deno permissions: `--allow-net` (for Ollama and online APIs)
- No external dependencies beyond standard library
- Full TypeScript strict mode support
- Comprehensive error handling for network failures
