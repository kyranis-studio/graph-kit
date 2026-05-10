import { GraphKit, registerInteractiveChatNode } from "../mod.ts";
import { DebugExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Interactive Chat" });
registerInteractiveChatNode(graph);

const chatNode = graph.addNode("interactive-chat", {
  metadata: { label: "Terminal Chat" },
  data: {
    model: "lfm2.5-thinking:latest",
    temperature: 0.7,
    streaming: true,
    systemPrompt: "You are a helpful assistant. Keep responses concise.",
    initialPrompt: "Introduce yourself briefly.",
  },
});

// Auto mode (non-interactive execution, node handles terminal interactively)
const engine = new DebugExecutionEngine({
  stepMode: false,
  onNodeStart: (info) =>
    console.log(`\n  [hook] start: ${info.nodeId} (${info.nodeType})`),
  onNodeComplete: (info) =>
    console.log(
      `  [hook] done: ${info.nodeId} in ${info.duration?.toFixed(0)}ms`,
    ),
});

const result = await engine.execute(graph);

const response = result.values.get(`${chatNode.id}.response`);
const conversation = result.values.get(`${chatNode.id}.conversation`);
const tokens = result.values.get(`${chatNode.id}.tokenCount`);

console.log(`\nSession complete. ${tokens ?? 0} tokens used.`);
if (response) {
  console.log(`Last response: ${(response as string).slice(0, 100)}...`);
}
