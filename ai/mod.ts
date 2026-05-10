import type { Graph } from '../src/types/index.ts';
import { getOllamaChatNodeType } from './nodes/ollama-chat.ts';
import { getOpenAIChatNodeType } from './nodes/openai-chat.ts';
import { getOpenRouterChatNodeType } from './nodes/openrouter-chat.ts';
import { getAIEmbeddingNodeType } from './nodes/ai-embedding.ts';
import { getInteractiveChatNodeType } from './nodes/interactive-chat.ts';
import { createOllamaProvider } from './providers/ollama.ts';
import { createOpenAIProvider } from './providers/openai.ts';
import { createOpenRouterProvider } from './providers/openrouter.ts';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolDefinition,
  ToolCall,
  AIProvider,
  FunctionDefinition,
} from './providers/types.ts';
import type { InteractiveTool } from './nodes/interactive-chat.ts';

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

export function registerInteractiveChatNode(graph: Graph): void {
  graph.registerNodeType('interactive-chat', getInteractiveChatNodeType());
}

export {
  createOllamaProvider,
  createOpenAIProvider,
  createOpenRouterProvider,
};

export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolDefinition,
  ToolCall,
  AIProvider,
  FunctionDefinition,
  InteractiveTool,
};
