// Web UI — Debug Mode (split-panel with step control + streaming)
// Run: deno run --allow-net --allow-read --allow-env examples/web-ui-debug.ts
// Open: http://localhost:3000
// The UI shows a horizontal split:
//   Left: graph visualization with step controls
//   Right: debug log + node details + streaming content

import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit, registerOllamaNodes, WebUIExecutionEngine } from "../mod.ts";

await loadEnv();

const graph = GraphKit.createGraph({ name: "AI Debug Demo" });
registerOllamaNodes(graph);

// ── Node 1: Generate a response via LLM ──
const writer = graph.addNode("ollama-chat", {
  metadata: { label: "AI Writer" },
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "Write a one-sentence story about a robot learning to paint.",
    temperature: 0.8,
    streaming: true,
    systemPrompt: "You are a creative writer. Keep responses very short.",
  },
});

// ── Node 2: Critique the response ──
const critic = graph.addNode("ollama-chat", {
  metadata: { label: "AI Critic" },
  data: {
    model: "lfm2.5-thinking:latest",
    temperature: 0.3,
    streaming: true,
    systemPrompt: "You are a constructive critic. Be brief.",
  },
});

// Wire writer's response into critic's prompt
graph.addEdge({
  sourceNodeId: writer.id,
  sourcePortId: "response",
  targetNodeId: critic.id,
  targetPortId: "prompt",
});

// ── Execute with debug mode (split-panel UI + step-by-step) ──
const engine = new WebUIExecutionEngine({
  port: 3030,
  debugMode: true, // Enables: split panel, step control, debug log
});

console.log("Web UI (debug mode): http://localhost:3030");
console.log("");
console.log("The page is split horizontally:");
console.log("  Left  — Graph visualization with Execute/Step/Cancel buttons");
console.log("  Right — Debug log with inputs, outputs, and streaming content");
console.log("");
console.log('Execution pauses before each node — click "Step" to advance');
console.log("Watch the AI streaming appear in real-time on the right panel");
console.log("");

const result = await engine.execute(graph);

console.log("=== Results ===");
console.log("Writer:", result.values.get(`${writer.id}.response`));
console.log("Critic:", result.values.get(`${critic.id}.response`));
