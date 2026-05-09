import { GraphKit, registerOllamaNodes } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "AI Workflow" });
registerOllamaNodes(graph);

const aiNode = graph.addNode("ollama-chat", {
  data: {
    model: "lfm2.5-thinking:latest",
    prompt: "Explain what a node graph library is in one sentence.",
    temperature: 0.5,
    streaming: true,
  },
});

const result = await graph.execute();
console.log(`\nAI Response: ${result.values.get(`${aiNode.id}.response`)}`);
