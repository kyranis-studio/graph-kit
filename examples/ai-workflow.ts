// AI Workflow example - requires Ollama running locally
import { GraphKit } from "../mod.ts";
import { registerOllamaNodes } from "../ai/mod.ts";
import { Colors, color } from "../src/utils/colors.ts";

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

console.log(color("Executing AI workflow...", Colors.teal));
console.log(color("Make sure Ollama is running with:", Colors.dim), color("ollama serve", Colors.teal));
console.log(color("And the model is pulled with:", Colors.dim), color("ollama pull <model>", Colors.teal));

try {
  const result = await graph.execute();
  console.log(color("Response:", Colors.teal), result.values.get(`${chatNode.id}.response`));
} catch (error: any) {
  console.error(color("Error:", Colors.coral), error.message);
  console.log(color("Make sure Ollama is running on", Colors.dim), color("http://localhost:11434", Colors.teal));
}
