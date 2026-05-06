import { GraphKit } from "../mod.ts";
import { ExecutionEngine } from "../src/execution/engine.ts";
import { registerOllamaNodes } from "../ai/mod.ts";
import { Colors, color } from "../src/utils/colors.ts";

const graph = GraphKit.createGraph({
  metadata: { name: "Streaming LLM Workflow Example" },
});

registerOllamaNodes(graph);

graph.registerNodeType("add", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number", required: false }],
  execute: async (inputs) => ({
    result: (inputs as any).a + (inputs as any).b,
  }),
});

graph.registerNodeType("format", {
  inputs: [
    { id: "value", name: "Value", type: "number", required: true },
    {
      id: "label",
      name: "Label",
      type: "string",
      required: false,
      defaultValue: "Result",
    },
  ],
  outputs: [{ id: "text", name: "Text", type: "string", required: false }],
  execute: async (inputs) => ({
    text: `${(inputs as any).label}: ${(inputs as any).value}`,
  }),
});

const mathNode = graph.addNode("add", {
  id: "math1",
  data: { a: 25, b: 17 },
  metadata: { label: "Math Calculation" },
});

const formatNode = graph.addNode("format", {
  id: "format1",
  data: { label: "Sum" },
  metadata: { label: "Format Result" },
});

const aiNode = graph.addNode("ollama-chat", {
  id: "ai1",
  data: {
    model: "granite4.1:3b",
    prompt: "Explain this calculation in one sentence: 25 + 17 = 42",
    temperature: 0.7,
    systemPrompt: "You are a helpful math tutor. Be concise.",
    streaming: true,
  },
  metadata: { label: "AI Explanation" },
});

graph.addEdge({
  sourceNodeId: mathNode.id,
  sourcePortId: "result",
  targetNodeId: formatNode.id,
  targetPortId: "value",
});

graph.addEdge({
  sourceNodeId: formatNode.id,
  sourcePortId: "text",
  targetNodeId: aiNode.id,
  targetPortId: "prompt",
});

const errors = graph.validate();
if (errors.length > 0) {
  console.error(color("Graph validation errors:", Colors.coral), errors);
  Deno.exit(1);
}

console.log(color("Make sure Ollama is running with:", Colors.dim), color("ollama serve", Colors.teal));
console.log(color("Pull model with:", Colors.dim), color("ollama pull llama3", Colors.teal), "\n");

const engine = new ExecutionEngine({ verbose: true });

const result = await engine.execute(graph);

console.log(color("\nFinal state:", Colors.teal));
for (const [key, value] of result.values) {
  const formattedKey = color(`  ${key}:`, Colors.sky);
  if (typeof value === "string" && value.length > 200) {
    console.log(`${formattedKey} ${value.slice(0, 200)}${color("...", Colors.dim)} (${color(String(value.length), Colors.gold)} chars)`);
  } else {
    console.log(`${formattedKey} ${color(String(value), Colors.silver)}`);
  }
}
