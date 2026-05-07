// AI Function Calling example - requires Ollama running locally
// This demonstrates defining tools/functions and having the LLM decide to call them.
import { createOllamaProvider } from "../ai/providers/ollama.ts";
import type { ToolDefinition, ChatMessage } from "../ai/providers/types.ts";

// Define weather tool
const weatherTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name, e.g. San Francisco",
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature unit",
        },
      },
      required: ["location"],
    },
  },
};

// Mock function that "gets weather"
function getWeather(location: string, unit = "celsius"): string {
  const temps: Record<string, number> = {
    tokyo: 22,
    "san francisco": 18,
    london: 12,
    paris: 20,
  };
  const temp = temps[location.toLowerCase()] ?? 15;
  const unitLabel = unit === "fahrenheit" ? "F" : "C";
  return `The weather in ${location} is ${temp}°${unitLabel} with clear skies.`;
}

// Execute tool calls returned by the LLM
function executeToolCalls(
  toolCalls: NonNullable<ChatMessage["tool_calls"]>,
): ChatMessage[] {
  return toolCalls.map((tc) => {
    const args = JSON.parse(tc.function.arguments);
    let result: string;

    switch (tc.function.name) {
      case "get_weather":
        result = getWeather(args.location, args.unit);
        break;
      default:
        result = `Unknown tool: ${tc.function.name}`;
    }

    return {
      role: "tool" as const,
      content: result,
      tool_call_id: tc.id,
    };
  });
}

// Main loop: send messages, handle tool calls, repeat
async function main() {
  console.log("Make sure Ollama is running on http://localhost:11434\n");

  const ollama = createOllamaProvider();
  const model = "functiongemma";

  const messages: ChatMessage[] = [
    { role: "user", content: "What's the weather in Tokyo and San Francisco?" },
  ];

  // Keep going until the LLM responds without tool calls
  let rounds = 0;
  while (rounds < 5) {
    rounds++;
    console.log(`\n--- Round ${rounds} ---`);
    console.log("User message:", messages[messages.length - 1].content);

    const response = await ollama.chat({
      model,
      messages,
      tools: [weatherTool],
    });

    const msg = response.message;
    console.log("Assistant:", msg.content || "(no text, calling tools...)");

    if (msg.tool_calls) {
      console.log(
        "Tool calls:",
        msg.tool_calls.map((tc) => tc.function.name).join(", "),
      );
      messages.push(msg);
      const toolResults = executeToolCalls(msg.tool_calls);
      for (const tr of toolResults) {
        console.log(`Tool result (${tr.tool_call_id}):`, tr.content);
      }
      messages.push(...toolResults);
    } else {
      console.log("\nFinal response:", msg.content);
      break;
    }
  }

  if (rounds >= 5) {
    console.log("Reached max rounds without final answer.");
  }
}

await main();
