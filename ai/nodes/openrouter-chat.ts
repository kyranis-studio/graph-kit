import type { NodeTypeDefinition, ExecutionContext } from '../../src/types/index.ts';
import { createOpenRouterProvider } from '../providers/openrouter.ts';

export function getOpenRouterChatNodeType(): NodeTypeDefinition {
  const openrouter = createOpenRouterProvider();

  return {
    inputs: [
      { id: 'prompt', name: 'Prompt', type: 'string', required: true },
      { id: 'model', name: 'Model', type: 'string', required: true, defaultValue: 'anthropic/claude-3-haiku' },
      { id: 'temperature', name: 'Temperature', type: 'number', required: false, defaultValue: 0.7 },
      { id: 'systemPrompt', name: 'System Prompt', type: 'string', required: false },
      { id: 'streaming', name: 'Streaming', type: 'boolean', required: false, defaultValue: false },
    ],
    outputs: [
      { id: 'response', name: 'Response', type: 'string', required: false },
      { id: 'thinking', name: 'Thinking', type: 'string', required: false },
      { id: 'usage', name: 'Usage', type: 'object', required: false },
    ],
    execute: async (inputs: any, context: ExecutionContext) => {
      const messages = [];
      if (inputs.systemPrompt) messages.push({ role: 'system', content: inputs.systemPrompt });
      messages.push({ role: 'user', content: inputs.prompt });

      let fullResponse = '';
      let fullThinking = '';
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

      if (inputs.streaming) {
        (context.config as any).__streaming = true;

        for await (const chunk of openrouter.streamChat({
          model: inputs.model,
          messages: messages as any,
          temperature: inputs.temperature,
        })) {
          // Update accumulated content
          if (chunk.fullContent) {
            fullResponse = chunk.fullContent;
          } else if (chunk.delta) {
            fullResponse += chunk.delta;
          }

          // Update thinking content
          if (chunk.fullThinking) {
            fullThinking = chunk.fullThinking;
          } else if (chunk.thinking) {
            fullThinking += chunk.thinking;
          }

          const state = {
            response: fullResponse,
            thinking: fullThinking || undefined,
            done: chunk.done,
          };
          context.graph.emit('llmStreamChunk', { nodeId: context.nodeId, state });

          if (chunk.done && chunk.usage) {
            usage = chunk.usage;
          }
        }
      } else {
        const response = await openrouter.chat({
          model: inputs.model,
          messages: messages as any,
          temperature: inputs.temperature,
        });
        fullResponse = response.message.content;
        usage = response.usage;
      }

      return {
        response: fullResponse,
        thinking: fullThinking || undefined,
        usage,
      };
    },
    metadata: { label: 'OpenRouter Chat', category: 'AI', color: '#f59e0b' },
  };
}
