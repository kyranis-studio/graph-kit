# GraphKit - Node Graph Library for Deno 2

## Product Requirements Document (PRD)

**Version:** 1.3  
**Date:** May 5, 2026  
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

**Sequential Execution** (default):
- Execute nodes in topological order
- Wait for all inputs to be available
- Support for parallel execution of independent nodes

**Debug Execution**:
- Interactive step-through mode (using `stepMode: true`)
- Rich CLI feedback with colors, timing, and data previews
- Real-time LLM streaming display (thinking and response)
- Lifecycle hooks (`onNodeStart`, `onNodeComplete`, `onNodeError`)
- Comprehensive execution logging via `DebugExecutionEngine`

**AI Workflow Execution** (State-based):
- State-based execution via `Workflow` interface
- Support for `START` and `END` logic
- Conditional edges (routing based on state)
- Human-in-the-loop support via `pause`/`resume` (in planning)

```typescript
interface GraphState {
  values: Map<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}
```

#### 2.4.3 Execution Control
- `execute(initialState?)`: Run the graph
- `debugEngine.execute(graph, initialState?)`: Run in debug mode
- `workflow.run(initialState?)`: Run a defined workflow
- Event emission for execution lifecycle (nodeStart, nodeComplete, nodeError)

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
│   ├── providers/          # Ollama, OpenAI providers
│   └── nodes/              # AI GraphKit nodes
├── src/                    # Core source
│   ├── core/               # Graph, Node, Edge, Port
│   ├── execution/          # Engine, Debug Engine, Workflow
│   ├── algorithms/         # Traversal, Sorting, Validation
│   ├── types/              # TS Types
│   └── utils/              # Export (Mermaid/DOT)
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

### 7.3 AI Function Calling

```typescript
import { createOllamaProvider } from "../ai/providers/ollama.ts";
import type { ToolDefinition, ChatMessage } from "../ai/providers/types.ts";

const weatherTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: { location: { type: "string" } },
      required: ["location"],
    },
  },
};

function getWeather(location: string): string {
  return `The weather in ${location} is 22°C with clear skies.`;
}

const ollama = createOllamaProvider();
const messages: ChatMessage[] = [
  { role: "user", content: "What's the weather in Tokyo and Paris?" },
];

// Loop until the LLM responds without tool calls
for (let i = 0; i < 5; i++) {
  const res = await ollama.chat({ model: "llama3.1", messages, tools: [weatherTool] });

  if (!res.message.tool_calls) {
    console.log("Final:", res.message.content);
    break;
  }

  messages.push(res.message);
  for (const tc of res.message.tool_calls) {
    const args = JSON.parse(tc.function.arguments);
    const result = getWeather(args.location);
    messages.push({ role: "tool", content: result, tool_call_id: tc.id });
  }
}
```

### 7.4 RAG Pipeline Visualization

```typescript
import { GraphKit, registerOllamaNodes } from './mod.ts';

const graph = GraphKit.createGraph({ name: 'RAG Pipeline' });
// ... register nodes and add connections ...
console.log(graph.toMermaid());
```

---

## 8. AI Inference Library Specification (@graph-kit/ai)

### 8.1 Supported Providers
- **Ollama**: Local inference, full streaming support, function calling
- **OpenAI**: Compatible with any OpenAI-style API, function calling

### 8.2 Function Calling (Tools)
Both providers support OpenAI-compatible tool/function calling. Define tool schemas using `ToolDefinition` and pass them via `ChatRequest.tools`. The LLM may respond with `tool_calls` on the response message.

**Types:**
```typescript
interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>; // JSON Schema
}

interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}
```

**Message Flow:**
1. Send user message + tool definitions → LLM responds with `tool_calls`
2. Execute the requested function locally using `tc.function.name` and parsed `tc.function.arguments`
3. Push the assistant's tool_calls message and tool result messages back
4. LLM incorporates results into a final text response

```typescript
import { createOllamaProvider } from "./ai/providers/ollama.ts";
import type { ToolDefinition, ChatMessage } from "./ai/providers/types.ts";

const ollama = createOllamaProvider();

const messages: ChatMessage[] = [
  { role: "user", content: "What's the weather in Tokyo?" },
];

const response = await ollama.chat({
  model: "llama3.1",
  messages,
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather for a location",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
    },
  }],
});

if (response.message.tool_calls) {
  for (const tc of response.message.tool_calls) {
    const args = JSON.parse(tc.function.arguments);
    // Execute local function
    const result = `Weather in ${args.location}: 22°C`;
    // Feed result back
    messages.push(response.message);
    messages.push({ role: "tool", content: result, tool_call_id: tc.id });
  }
  // Get final response
  const final = await ollama.chat({ model: "llama3.1", messages });
  console.log(final.message.content);
}
```

### 8.3 Integration
- Exports `registerOllamaNodes(graph)` and `registerOpenAINodes(graph)`
- Nodes handle all LLM communication; user only provides data/config

### 8.4 Provider API

```typescript
interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<string[]>;
}
```
