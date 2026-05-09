import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit, registerOpenRouterNodes } from "../mod.ts";

await loadEnv();

const graph = GraphKit.createGraph({ name: "OpenRouter AI" });
registerOpenRouterNodes(graph);

const aiNode = graph.addNode("openrouter-chat", {
  data: {
    model: "openrouter/free",
    prompt: "Write a small tourism  promo about Tunisia?",
    temperature: 0.7,
    streaming: true,
  },
});

const result = await graph.execute();
console.log(`\nAI Response: ${result.values.get(`${aiNode.id}.response`)}`);
