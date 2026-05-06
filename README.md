# GraphKit - Node Graph Library for Deno 2

GraphKit is a lightweight, TypeScript-first library for building node graph applications in Deno 2. It provides the computational layer for creating, connecting, and executing node-based workflows.

## Features

- **Node System**: Typed units with inputs, outputs, and execution logic
- **Port System**: Type-safe data flow between nodes
- **Edge System**: Connect output ports to input ports
- **Execution Engine**: Sequential and state-based Workflow execution modes
- **Debug Engine**: Interactive step-through execution with rich CLI feedback
- **AI-First**: Built-in support for Ollama and OpenAI-compatible providers
- **Visualization**: Export graphs directly to Mermaid and DOT formats
- **TypeScript Native**: Full strict mode support with generics

## Installation

```typescript
// mod.ts exports everything you need
import { GraphKit } from './mod.ts';
```

## Quick Start

```typescript
import { GraphKit } from './mod.ts';

const graph = GraphKit.createGraph({ name: 'Basic Math' });

// Define a simple math node
graph.registerNodeType('add', {
  inputs: [
    { id: 'a', name: 'A', type: 'number', required: true },
    { id: 'b', name: 'B', type: 'number', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'number' },
  ],
  execute: async (inputs: any) => ({
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

// Execute graph
const result = await graph.execute();
console.log('Final Result:', result.values.get(`${n2.id}.result`)); // 18
```

## AI Features (Ollama, OpenAI & OpenRouter)

Integration with local AI models via Ollama, cloud providers like OpenAI, and 200+ models via OpenRouter is built-in.

### Environment Setup

Create a `.env` file in your project root:

```
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-v1-...
```

Load it in your code:

```typescript
import { loadEnv } from './src/utils/dotenv.ts';
await loadEnv();
```

### OpenRouter Example

```typescript
import { loadEnv } from './src/utils/dotenv.ts';
import { GraphKit, registerOpenRouterNodes } from "./mod.ts";

await loadEnv();

const graph = GraphKit.createGraph();
registerOpenRouterNodes(graph);

// Basic usage (non-streaming)
const aiNode = graph.addNode("openrouter-chat", {
  data: {
    model: "anthropic/claude-3-haiku",  // 200+ models available
    prompt: "Explain Deno 2",
    temperature: 0.7,
  }
});

const result = await graph.execute();
console.log("AI Response:", result.values.get(`${aiNode.id}.response`));
```

### Streaming with Thinking Support

All providers support streaming mode with thinking content for models that expose reasoning (e.g., DeepSeek R1, OpenAI o1, LFM2.5).

```typescript
import { loadEnv } from './src/utils/dotenv.ts';
import { GraphKit, registerOpenRouterNodes } from "./mod.ts";

await loadEnv();

const graph = GraphKit.createGraph();
registerOpenRouterNodes(graph);

const aiNode = graph.addNode("openrouter-chat", {
  data: {
    model: "deepseek/deepseek-r1",  // Model with thinking support
    prompt: "Solve: What is 15 * 23?",
    streaming: true,  // Enable streaming mode
    temperature: 0.7,
  }
});

// Listen for streaming chunks
graph.on('llmStreamChunk', ({ nodeId, state }) => {
  if (state.thinking) console.log('Thinking:', state.thinking);
  if (state.done) console.log('Response:', state.response);
});

const result = await graph.execute();
console.log("Final Response:", result.values.get(`${aiNode.id}.response`));
const thinking = result.values.get(`${aiNode.id}.thinking`);
if (thinking) console.log("Thinking:", thinking);
```

### Ollama Example

```typescript
import { GraphKit, registerOllamaNodes } from "./mod.ts";

const graph = GraphKit.createGraph();
registerOllamaNodes(graph);

// Basic usage
const aiNode = graph.addNode("ollama-chat", {
  data: {
    model: "granite4.1:3b",
    prompt: "Explain Deno 2",
    temperature: 0.5,
  }
});

const result = await graph.execute();
console.log("AI Response:", result.values.get(`${aiNode.id}.response`));

// With streaming and thinking support (e.g., lfm2.5-thinking:latest)
const thinkingNode = graph.addNode("ollama-chat", {
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "Solve: 10 + 15",
    streaming: true,
  }
});

graph.on('llmStreamChunk', ({ state }) => {
  if (state.done) console.log('Response:', state.response);
});

await graph.execute();
```

## Workflow Execution

For complex, state-based flows with conditional logic, use the `Workflow` API.

```typescript
const workflow = graph.createWorkflow({
  startNode: 'agent1',
  endNode: 'final-output',
});

workflow.connect('agent1.response', 'router.input');

workflow.addConditionalEdge({
  sourceNodeId: 'router',
  condition: (state) => {
    return state.values.get('router.is_tech') ? 'tech-agent' : 'general-agent';
  }
});

await workflow.run();
```

## Debugging & Observability

Use the `DebugExecutionEngine` for interactive debugging. It supports `stepMode` which waits for user input between node executions.

```typescript
import { DebugExecutionEngine } from "./mod.ts";

const debugEngine = new DebugExecutionEngine({
  stepMode: true, // Wait for SPACE key
  onNodeStart: (info) => console.log(`Starting: ${info.nodeId}`),
});

const result = await debugEngine.execute(graph);
```

## Visualization

Generate diagrams for your graphs instantly.

```typescript
console.log(graph.toMermaid());
console.log(graph.toDOT());
```

See `examples/mermaid-complex.ts` for generating complete Markdown reports with diagrams.

## Middleware

```typescript
graph.use(async (context, next) => {
  const start = Date.now();
  await next();
  console.log(`${context.nodeId} took ${Date.now() - start}ms`);
});
```

## Testing

```bash
deno test --allow-read tests/
```

## License

MIT
