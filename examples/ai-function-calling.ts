import { createOllamaProvider } from "../ai/providers/ollama.ts";
import type { ToolDefinition, ChatMessage } from "../ai/providers/types.ts";

const weatherTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["location"],
    },
  },
};

async function getWeather(location: string, unit = "celsius"): Promise<string> {
  return `The weather in ${location} is 22°${unit === "celsius" ? "C" : "F"} and sunny.`;
}

const ollama = createOllamaProvider();
const messages: ChatMessage[] = [
  { role: "user", content: "What's the weather in Tokyo?" },
];

console.log("\n--- Function Calling Loop ---\n");

let iterations = 0;
const maxIterations = 5;

while (iterations < maxIterations) {
  iterations++;
  const response = await ollama.chat({
    model: "functiongemma:latest",
    messages,
    tools: [weatherTool],
  });

  if (response.message.tool_calls) {
    messages.push(response.message);
    for (const tc of response.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      console.log(`  Calling: ${tc.function.name}(${JSON.stringify(args)})`);

      const result = await getWeather(args.location, args.unit);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
      console.log(`  Result: ${result}\n`);
    }
  } else {
    console.log(`  Final: ${response.message.content}\n`);
    break;
  }
}
