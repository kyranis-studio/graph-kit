import { GraphKit } from "../mod.ts";
import { DebugExecutionEngine } from "../src/execution/debug-engine.ts";
import { registerOllamaNodes } from "../ai/mod.ts";
import { Colors, color, bold } from "../src/utils/colors.ts";

const graph = GraphKit.createGraph({
  metadata: { name: "LFM2.5 Thinking Debug Example" },
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
  console.error(color("Graph validation errors:", Colors.coral), errors);
  Deno.exit(1);
}

console.log(color("Make sure Ollama is running with:", Colors.dim), color("ollama serve", Colors.teal));
console.log(color("Pull model with:", Colors.dim), color("ollama pull lfm2.5-thinking:latest", Colors.teal));
console.log(color("\nControls: SPACE = next node, ESC = cancel", Colors.gold), "\n");

const debugEngine = new DebugExecutionEngine({
  stepMode: true,
  onNodeStart: (info) => {
    console.log(color("[HOOK]", Colors.rose), color("Starting:", Colors.dim), bold(color(info.nodeId, Colors.sky)), color(`(${info.nodeType})`, Colors.dim));
  },
  onNodeComplete: (info) => {
    console.log(
      color("[HOOK]", Colors.teal), color("Completed:", Colors.dim), bold(color(info.nodeId, Colors.sky)), color(`in ${info.duration?.toFixed(2)}ms`, Colors.gold),
    );
  },
});

const result = await debugEngine.execute(graph);

console.log(color(Colors.line.repeat(60), Colors.dim));
console.log(`${color(' FINAL STATE ', Colors.bold + Colors.bgTeal + Colors.white)}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
for (const [key, value] of result.values) {
  const formattedKey = color(key, Colors.sky);
  if (typeof value === "string" && value.length > 200) {
    console.log(`  ${color(Colors.bullet, Colors.sky)} ${formattedKey}${color(':', Colors.dim)} ${value.slice(0, 200)}${color("...", Colors.dim)} (${color(String(value.length), Colors.gold)} chars)`);
  } else {
    console.log(`  ${color(Colors.bullet, Colors.sky)} ${formattedKey}${color(':', Colors.dim)} ${color(String(value), Colors.silver)}`);
  }
}

console.log(`\n${color(Colors.line.repeat(60), Colors.dim)}`);
console.log(`${color(' EXECUTION LOG ', Colors.bold + Colors.bgGray + Colors.white)}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
for (const entry of debugEngine.executionLog) {
  const statusColor = entry.status === 'completed' ? Colors.teal : entry.status === 'error' ? Colors.coral : Colors.sky;
  const icon = entry.status === 'completed' ? Colors.check : entry.status === 'error' ? Colors.cross : Colors.dot;
  console.log(`  ${color(icon, statusColor)} ${bold(color(entry.nodeId, Colors.sky))} ${color(`(${entry.nodeType})`, Colors.dim)}${color(':', Colors.dim)} ${color(entry.status, statusColor)}`);
}
console.log(color(Colors.line.repeat(60), Colors.dim) + '\n');
