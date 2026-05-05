// AI Workflow example - requires Ollama running locally
import { GraphKit } from "../mod.ts";
import { registerOllamaNodes } from "../ai/mod.ts";

const graph = GraphKit.createGraph({
  metadata: { name: "AI Workflow Example" },
});

// Register Ollama nodes
registerOllamaNodes(graph);

// Add Ollama chat node
const chatNode = graph.addNode("ollama-chat", {
  data: {
    model: "granite4.1:3b",
    prompt: "Explain Deno 2 in simple terms",
    temperature: 0.5,
    systemPrompt: "You are a helpful assistant.",
  },
});

console.log("Executing AI workflow...");
console.log("Make sure Ollama is running with: ollama serve");
console.log("And ehe model is pulled with: ollama pull <model>");

try {
  const result = await graph.execute();
  console.log("Response:", result.values.get(`${chatNode.id}.response`));
} catch (error) {
  console.error("Error:", error.message);
  console.log("Make sure Ollama is running on http://localhost:11434");
}
