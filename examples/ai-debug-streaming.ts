import { GraphKit, registerOllamaNodes, DebugExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Debug Streaming AI" });
registerOllamaNodes(graph);

const aiNode = graph.addNode("ollama-chat", {
  metadata: { label: "AI Chat" },
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "Write a haiku about node graphs.",
    streaming: true,
    temperature: 0.7,
  },
});

const debugEngine = new DebugExecutionEngine({
  stepMode: false,
  onNodeStart: (info) =>
    console.log(`\n  [hook] start: ${info.nodeId} (${info.nodeType})`),
  onNodeComplete: (info) =>
    console.log(
      `  [hook] done: ${info.nodeId} in ${info.duration?.toFixed(0)}ms`,
    ),
  onStreamChunk: (chunk) => {
    if (chunk.state.done) {
      console.log(`  [hook] stream end: ${chunk.state.response.length} chars`);
    }
  },
});

const result = await debugEngine.execute(graph);
console.log(
  `\nFinal AI Response: ${result.values.get(`${aiNode.id}.response`)}`,
);
