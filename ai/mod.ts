import type { Graph } from '../src/types/index.ts';
import { getOllamaChatNodeType } from './nodes/ollama-chat.ts';
import { getOpenAIChatNodeType } from './nodes/openai-chat.ts';
import { getOpenRouterChatNodeType } from './nodes/openrouter-chat.ts';
import { getAIEmbeddingNodeType } from './nodes/ai-embedding.ts';

export function registerOllamaNodes(graph: Graph): void {
  graph.registerNodeType('ollama-chat', getOllamaChatNodeType());
}

export function registerOpenAINodes(graph: Graph): void {
  graph.registerNodeType('openai-chat', getOpenAIChatNodeType());
}

export function registerOpenRouterNodes(graph: Graph): void {
  graph.registerNodeType('openrouter-chat', getOpenRouterChatNodeType());
}

export function registerEmbeddingNodes(graph: Graph): void {
  graph.registerNodeType('ai-embedding', getAIEmbeddingNodeType());
}
