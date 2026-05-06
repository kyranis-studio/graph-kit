// OpenRouter Example - requires OPENROUTER_API_KEY in .env file
import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit } from "../mod.ts";
import { registerOpenRouterNodes } from "../ai/mod.ts";
import { Colors, color, bold } from "../src/utils/colors.ts";

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

console.log(
  color("Executing OpenRouter workflow with streaming...", Colors.teal),
);
console.log(
  color(
    "Make sure you have OPENROUTER_API_KEY set in your .env file",
    Colors.dim,
  ),
);

// Listen for streaming chunks (thinking and response)
graph.on("llmStreamChunk", (data: unknown) => {
  const { nodeId, state } = data as { nodeId: string; state: { thinking?: string; response: string; done: boolean } };
  if (state.thinking && state.done === false) {
    // Optionally display thinking in real-time
    // process.stdout.write(`Thinking: ${state.thinking.slice(-1)}`);
  }

  if (state.done) {
    console.log(color("\n=== Streaming Complete ===", Colors.teal));
    if (state.thinking) {
      console.log(color("Thinking:", Colors.rose), state.thinking);
    }
    console.log(color("Response:", Colors.teal), state.response);
  }
});

try {
  const result = await graph.execute();
  // Final result is also available via the execution result
  console.log(
    color("\nFinal Response:", Colors.teal),
    result.values.get(`${chatNode.id}.response`),
  );
  const thinking = result.values.get(`${chatNode.id}.thinking`);
  if (thinking) {
    console.log(color("Thinking:", Colors.rose), thinking);
  }
} catch (error: any) {
  console.error(color("Error:", Colors.coral), error.message);
  console.log(
    color("Get your API key from:", Colors.dim),
    color("https://openrouter.ai/keys", Colors.teal),
  );
}
