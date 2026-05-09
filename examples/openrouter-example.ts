import { loadEnv } from '../src/utils/dotenv.ts';
import { GraphKit, registerOpenRouterNodes } from '../mod.ts';

await loadEnv();

const graph = GraphKit.createGraph({ name: 'OpenRouter AI' });
registerOpenRouterNodes(graph);

const aiNode = graph.addNode('openrouter-chat', {
  data: {
    model: 'anthropic/claude-3-haiku',
    prompt: 'What is the capital of France?',
    temperature: 0.7,
  },
});

const result = await graph.execute();
console.log(`\nAI Response: ${result.values.get(`${aiNode.id}.response`)}`);
