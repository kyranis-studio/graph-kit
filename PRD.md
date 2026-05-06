# GraphKit - Node Graph Library for Deno 2

## Product Requirements Document (PRD)

**Version:** 1.4  
**Date:** May 6, 2026  
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
  execute: NodeExecutor;
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
  schema?: unknown;
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

**Sequential Execution** (default via `ExecutionEngine`):
- Execute nodes in topological order
- Wait for all inputs to be available
- Support for parallel execution of independent nodes
- **Minimal logging enabled by default** (`logLevel: 'minimal'`) showing node progress and completion status
- Three log levels: `'silent'` (no output), `'minimal'` (default, basic progress), `'verbose'` (detailed with streaming)
- Can be configured via `new ExecutionEngine({ logLevel: 'verbose' })` or `graph.execute(state, { logLevel: 'silent' })`
- Backward compatible with `verbose: boolean` option
- Real-time LLM streaming display (thinking and response) only in `verbose` mode

```typescript
const engine = new ExecutionEngine({ verbose: true });
const result = await engine.execute(graph);
```

**Debug Execution** (via `DebugExecutionEngine`):
- Interactive step-through mode (using `stepMode: true`)
- Rich CLI feedback with colors, timing, and data previews
- Real-time LLM streaming display (thinking and response)
- Lifecycle hooks (`onNodeStart`, `onNodeComplete`, `onNodeError`, `onStreamChunk`)
- Comprehensive execution logging via `executionLog`
- Stream state tracking with `#streamState`, `#streamStarted` maps

**AI Workflow Execution** (State-based via `Workflow`):
- State-based execution via `Workflow` interface
- Support for `START` and `END` logic
- Conditional edges (routing based on state)
- **Minimal logging enabled by default** (`logLevel: 'minimal'`)
- Three log levels: `'silent'`, `'minimal'` (default), `'verbose'`
- Configure via `graph.createWorkflow({ startNode, endNode, logLevel: 'verbose' })`
- Backward compatible with `verbose: boolean` option
- Real-time streaming display for LLM nodes only in `verbose` mode
- Human-in-the-loop support via `pause`/`resume` (in planning)

```typescript
interface GraphState {
  values: Map<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}
```

#### 2.4.3 Execution Control
- `execute(initialState?, options?)`: Run the graph (via `graph.execute()`) with minimal logging by default
  - `options.logLevel: 'silent' | 'minimal' | 'verbose'` to control logging
  - `options.silent = true` (deprecated, use `logLevel: 'silent'`)
- `new ExecutionEngine({ logLevel?, verbose? })`: Create engine with specified log level
  - `logLevel: 'silent'` - no output
  - `logLevel: 'minimal'` (default) - basic progress and completion
  - `logLevel: 'verbose'` - detailed step-by-step with streaming display
  - `verbose: boolean` (legacy) - `true` maps to `'verbose'`, `false` maps to `'silent'`
- `engine.execute(graph, initialState?)`: Run with configured log level
- `debugEngine.execute(graph, initialState?)`: Run in debug mode with interactive stepping (always verbose)
- `workflow.run(initialState?)`: Run a defined workflow with minimal logging by default
- Event emission for execution lifecycle (nodeStart, nodeComplete, nodeError, llmStreamChunk)

### 2.5 Middleware System
GraphKit supports a middleware pattern similar to Koa or Express, allowing developers to intercept and augment node execution.

```typescript
graph.use(async (context, next) => {
  console.log(`Executing node: ${context.nodeId}`);
  const start = Date.now();
  await next();
  console.log(`Completed in ${Date.now() - start}ms`);
});
```

### 2.6 State Management

#### 2.5.1 State Flow
- State flows through edges
- Nodes read from input ports, write to output ports
- State is managed in a `Map` within `GraphState`

#### 2.5.2 Persistence
- Checkpoint state at each step
- Resume from any checkpoint
- In-memory or custom storage backend via `StateStore`

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
import { GraphKit, registerOllamaNodes } from './mod.ts';

// Create a new graph
const graph = GraphKit.createGraph({ name: 'My Workflow' });

// Register AI nodes (pre-built)
registerOllamaNodes(graph);

// Add node
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
const result = await graph.execute();

// Using Workflow for complex flows
const workflow = graph.createWorkflow({
  startNode: 'start',
  endNode: 'end',
  onStateUpdate: (state) => console.log('State updated')
});

workflow.connect('start.output', 'process.input')
        .connect('process.output', 'end.input');

await workflow.run();
```

### 3.3 Querying and Inspection

```typescript
// Get graph structure
const nodes = graph.nodes;
const edges = graph.edges;

// Validate graph
const errors = graph.validate();

// Serialization
const json = graph.toJSON();
const restored = GraphKit.fromJSON(json);

// Visualization
const mermaid = graph.toMermaid();
```

---

## 4. Advanced Features

### 4.1 Conditional Edges
```typescript
workflow.addConditionalEdge({
  sourceNodeId: 'router',
  condition: (state) => {
    if (state.values.get('router.category') === 'technical') {
      return 'tech-agent';
    }
    return 'general-agent';
  }
});
```

### 4.2 Subgraphs
- Nest graphs within nodes (planned)
- Encapsulate complex logic

### 4.3 Visualization Helpers
- Export to Mermaid and DOT
- Built-in support for node colors and labels in diagrams

```typescript
console.log(graph.toMermaid());
```

---

## 5. Non-Functional Requirements

### 5.1 Performance
- Efficient topological sort for execution
- Support for parallel execution of independent branches

### 5.2 TypeScript Support
- Strict typing for all interfaces
- Generic support for node executors

### 5.3 Deno 2 Compatibility
- Pure ESM
- Native Deno APIs (crypto, fetch)

---

## 6. Project Structure

```
graph-kit/
├── mod.ts                  # Main entry point
├── ai/                     # AI inference library
│   ├── mod.ts              # AI library registration
│   ├── providers/          # Ollama, OpenAI, OpenRouter providers
│   └── nodes/              # AI GraphKit nodes
├── src/                    # Core source
│   ├── core/               # Graph, Node, Edge, Port
│   ├── execution/          # Engine, Debug Engine, Workflow
│   ├── algorithms/         # Traversal, Sorting, Validation
│   ├── types/              # TS Types
│   └── utils/              # Export (Mermaid/DOT), dotenv loader
├── tests/                  # Unit tests
└── examples/               # Usage examples
```

---

## 7. Usage Examples

### 7.1 Basic Node Graph

```typescript
import { GraphKit, registerOllamaNodes } from './mod.ts';

const graph = GraphKit.createGraph();

graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true }
  ],
  outputs: [{ id: 'result', name: 'Result', type: 'number' }],
  execute: async (inputs: any) => ({
    result: inputs.a + inputs.b
  })
});

const n1 = graph.addNode('add', { data: { a: 5, b: 3 } });
const n2 = graph.addNode('add', { data: { b: 10 } });

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: 'result',
  targetNodeId: n2.id,
  targetPortId: 'a'
});

const result = await graph.execute();
console.log(result.values.get(`${n2.id}.result`)); // 18
```

### 7.2 AI Debugging with Streaming (LFM2.5)

```typescript
import { GraphKit, DebugExecutionEngine, registerOllamaNodes } from "./mod.ts";

const graph = GraphKit.createGraph();
registerOllamaNodes(graph);

const aiNode = graph.addNode("ollama-chat", {
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "Solve: 10 + 15",
    streaming: true,
  },
  metadata: { label: "LFM2.5 Thinking" }
});

const debugEngine = new DebugExecutionEngine({
  stepMode: true,
  onNodeStart: (info) => console.log(`Starting: ${info.nodeId}`),
});

await debugEngine.execute(graph);
```

### 7.3 RAG Pipeline Visualization

```typescript
import { GraphKit, registerOllamaNodes } from './mod.ts';

const graph = GraphKit.createGraph({ name: 'RAG Pipeline' });
// ... register nodes and add connections ...
console.log(graph.toMermaid());
```

### 7.4 OpenRouter Multi-Model Example

```typescript
import { loadEnv } from './src/utils/dotenv.ts';
import { GraphKit, registerOpenRouterNodes } from './mod.ts';

// Load API key from .env file
await loadEnv();

const graph = GraphKit.createGraph({ name: 'OpenRouter Example' });
registerOpenRouterNodes(graph);

// Use any model from openrouter.ai/models
const chatNode = graph.addNode('openrouter-chat', {
  data: {
    model: 'anthropic/claude-3-haiku',
    prompt: 'Explain Deno 2 in simple terms',
    temperature: 0.7,
    systemPrompt: 'You are a helpful assistant.',
  },
});

const result = await graph.execute();
console.log('Response:', result.values.get(`${chatNode.id}.response`));
```

### 7.5 Streaming with Thinking Support

All AI providers (Ollama, OpenAI, OpenRouter) support streaming mode with thinking content. This is useful for models that expose their reasoning process (e.g., DeepSeek R1, LFM2.5, OpenAI o1).

```typescript
import { loadEnv } from './src/utils/dotenv.ts';
import { GraphKit, registerOpenRouterNodes } from './mod.ts';

await loadEnv();

const graph = GraphKit.createGraph({ name: 'Streaming with Thinking' });
registerOpenRouterNodes(graph);

const chatNode = graph.addNode('openrouter-chat', {
  data: {
    model: 'deepseek/deepseek-r1', // Model with thinking support
    prompt: 'Solve: What is 15 * 23?',
    streaming: true, // Enable streaming mode
    temperature: 0.7,
  },
});

// Listen for streaming chunks (thinking and response)
graph.on('llmStreamChunk', ({ nodeId, state }) => {
  if (state.thinking) {
    console.log('Thinking:', state.thinking);
  }
  if (state.done) {
    console.log('Final Response:', state.response);
  }
});

const result = await graph.execute();
console.log('Response:', result.values.get(`${chatNode.id}.response`));
const thinking = result.values.get(`${chatNode.id}.thinking`);
if (thinking) {
  console.log('Thinking:', thinking);
}
```

### 7.6 ExecutionEngine with Logging Levels

The `ExecutionEngine` supports three logging levels: `'silent'`, `'minimal'` (default), and `'verbose'`.

```typescript
import { GraphKit, ExecutionEngine, registerOllamaNodes } from './mod.ts';

const graph = GraphKit.createGraph({ name: 'Streaming Workflow' });
registerOllamaNodes(graph);

// ... add nodes with streaming: true ...

// Minimal logging (default) - shows node progress and completion
const engine = new ExecutionEngine();
const result = await engine.execute(graph);

// Silent mode - no output
const silentEngine = new ExecutionEngine({ logLevel: 'silent' });

// Verbose mode - detailed logging with streaming display
const verboseEngine = new ExecutionEngine({ logLevel: 'verbose' });
const result2 = await verboseEngine.execute(graph);

// Output in verbose mode shows:
// ● [1/3] math1 (add)
//   inputs: a=10, b=15
//   ✓ complete
// ● [2/3] ai1 (ollama-chat)
//   ▸ thinking: [streaming thinking content...]
//   ▸ response: [streaming response content...]
//   ✓ complete

// Backward compatible
const legacyEngine = new ExecutionEngine({ verbose: true }); // Maps to logLevel: 'verbose'
```

---

## 8. AI Inference Library Specification (@graph-kit/ai)

### 8.1 Supported Providers
- **Ollama**: Local inference, full streaming support with thinking content (e.g., LFM2.5, Granite models)
- **OpenAI**: Compatible with any OpenAI-style API, supports thinking content for o1 models
- **OpenRouter**: Access 200+ models via unified API, requires `OPENROUTER_API_KEY`, supports thinking models like DeepSeek R1

### 8.2 Environment Configuration
- Load API keys from `.env` file using `loadEnv()` utility
- Supports `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL` variables
- Automatic fallback to environment variables if `.env` not present

### 8.3 Integration
- Exports `registerOllamaNodes(graph)`, `registerOpenAINodes(graph)`, and `registerOpenRouterNodes(graph)`
- Nodes handle all LLM communication; user only provides data/config
- Example: `examples/openrouter-example.ts`
