// OpenRouter Example - requires OPENROUTER_API_KEY in .env file
import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit } from "../mod.ts";
import { registerOpenRouterNodes } from "../ai/mod.ts";

// Load environment variables from .env file
await loadEnv();

const graph = GraphKit.createGraph({
  metadata: { name: "OpenRouter Example" },
});

// Register OpenRouter nodes
registerOpenRouterNodes(graph);

// Add OpenRouter chat node with streaming enabled
// Popular models: anthropic/claude-3-haiku, google/gemini-flash-1.5, meta-llama/llama-3.1-8b-instruct
// Models with thinking support: deepseek/deepseek-r1, qwen/qwq-32b
const chatNode = graph.addNode("openrouter-chat", {
  data: {
    model: "deepseek/deepseek-r1", // Model with thinking support
    prompt: "Explain Deno 2 in simple terms",
    temperature: 0.7,
    systemPrompt: "You are a helpful assistant.",
    streaming: true, // Enable streaming mode
  },
});

console.log("Executing OpenRouter workflow with streaming...");
console.log("Make sure you have OPENROUTER_API_KEY set in your .env file");

// Listen for streaming chunks (thinking and response)
graph.on('llmStreamChunk', ({ nodeId, state }) => {
  if (state.thinking && state.done === false) {
    // Optionally display thinking in real-time
    // process.stdout.write(`Thinking: ${state.thinking.slice(-1)}`);
  }

  if (state.done) {
    console.log('\n=== Streaming Complete ===');
    if (state.thinking) {
      console.log('Thinking:', state.thinking);
    }
    console.log('Response:', state.response);
  }
});

try {
  const result = await graph.execute();
  // Final result is also available via the execution result
  console.log("\nFinal Response:", result.values.get(`${chatNode.id}.response`));
  const thinking = result.values.get(`${chatNode.id}.thinking`);
  if (thinking) {
    console.log("Thinking:", thinking);
  }
} catch (error) {
  console.error("Error:", error.message);
  console.log("Get your API key from: https://openrouter.ai/keys");
}
