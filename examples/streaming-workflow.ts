import { GraphKit, registerOllamaNodes } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Streaming LLM" });
registerOllamaNodes(graph);

const aiNode = graph.addNode("ollama-chat", {
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "Write a short poem about software engineering.",
    streaming: true,
    temperature: 0.7,
  },
});

graph.on("llmStreamChunk", (data: unknown) => {
  const { state } = data as { nodeId: string; state: { done: boolean } };
  if (state.done) {
    console.log("\n\n[stream complete]");
  }
});

const result = await graph.execute();
console.log(
  `\nFinal Response (${result.values.get(`${aiNode.id}.response`)!.toString().length} chars)`,
);

const thinking = result.values.get(`${aiNode.id}.thinking`);
if (thinking) {
  console.log(`Thinking (${thinking.toString().length} chars)`);
}
