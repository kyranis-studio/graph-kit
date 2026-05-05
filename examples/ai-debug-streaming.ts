import { GraphKit } from "../mod.ts";
import { DebugExecutionEngine } from "../src/execution/debug-engine.ts";
import { registerOllamaNodes } from "../ai/mod.ts";

const graph = GraphKit.createGraph({
  metadata: { name: "LFM2.5 Thinking Debug Example" },
});

registerOllamaNodes(graph);

graph.registerNodeType("add", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs) => ({
    result: (inputs as any).a + (inputs as any).b,
  }),
});

// Build graph: math -> AI with streaming thinking
const mathNode = graph.addNode("add", {
  id: "math1",
  data: { a: 10, b: 15 },
  metadata: { label: "Math" },
});

const aiNode = graph.addNode("ollama-chat", {
  id: "ai1",
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "If a train travels at 60 mph for 2.5 hours, how far does it go?",
    temperature: 0.7,
    systemPrompt:
      "You are a helpful assistant. Think through your reasoning step by step.",
    streaming: true,
  },
  metadata: { label: "LFM2.5 Thinking" },
});

graph.addEdge({
  sourceNodeId: mathNode.id,
  sourcePortId: "result",
  targetNodeId: aiNode.id,
  targetPortId: "prompt",
});

const errors = graph.validate();
if (errors.length > 0) {
  console.error("Graph validation errors:", errors);
  Deno.exit(1);
}

console.log("Make sure Ollama is running with: ollama serve");
console.log("Pull model with: ollama pull lfm2.5-thinking:latest");
console.log("\nControls: SPACE = next node, ESC = cancel\n");

const debugEngine = new DebugExecutionEngine({
  stepMode: true,
  onNodeStart: (info) => {
    console.log(`[HOOK] Starting: ${info.nodeId} (${info.nodeType})`);
  },
  onNodeComplete: (info) => {
    console.log(
      `[HOOK] Completed: ${info.nodeId} in ${info.duration?.toFixed(2)}ms`,
    );
  },
});

const result = await debugEngine.execute(graph);

console.log("\nFinal state:");
for (const [key, value] of result.values) {
  if (typeof value === "string" && value.length > 200) {
    console.log(`  ${key}: ${value.slice(0, 200)}... (${value.length} chars)`);
  } else {
    console.log(`  ${key}: ${value}`);
  }
}

console.log("\nExecution log:");
for (const entry of debugEngine.executionLog) {
  console.log(`  ${entry.nodeId} (${entry.nodeType}): ${entry.status}`);
}
