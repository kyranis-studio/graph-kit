import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit, WebUIExecutionEngine, registerOllamaNodes } from "../mod.ts";

await loadEnv();

const graph = GraphKit.createGraph({ name: "AI Chat Streaming" });
registerOllamaNodes(graph);

graph.addNode("ollama-chat", {
  id: "chat",
  metadata: { label: "AI Chat" },
  data: {
    model: "lfm2.5-thinking:latest",
    systemPrompt: "You are a helpful assistant. Keep responses concise.",
    temperature: 0.7,
    streaming: true,
  },
});

const engine = new WebUIExecutionEngine({ port: 3030, debugMode: true });
console.log("\n  Open http://localhost:3030 in your browser");
console.log(
  "  Click the 'AI Chat' node, type a prompt, click 'Apply Inputs', then Execute\n",
);
await engine.execute(graph);
