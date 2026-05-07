import type { NodeTypeDefinition, ExecutionContext } from '../../src/types/index.ts';
import { createOpenAIProvider } from '../providers/openai.ts';

export function getOpenAIChatNodeType(): NodeTypeDefinition {
  const openai = createOpenAIProvider();

  return {
    inputs: [
      { id: 'prompt', name: 'Prompt', type: 'string', required: true },
      { id: 'model', name: 'Model', type: 'string', required: true, defaultValue: 'gpt-4' },
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
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

      if (inputs.streaming) {
        (context.config as any).__streaming = true;
        
        for await (const chunk of openai.streamChat({
          model: inputs.model,
          messages: messages as any,
          temperature: inputs.temperature,
        })) {
          if (chunk.delta) {
            fullResponse += chunk.delta;
          }
          
          const state = {
            response: fullResponse,
            done: chunk.done,
          };
          context.graph.emit('llmStreamChunk', { nodeId: context.nodeId, state });
        }
      } else {
        const response = await openai.chat({
          model: inputs.model,
          messages: messages as any,
          temperature: inputs.temperature,
        });
        fullResponse = response.message.content ?? '';
        usage = response.usage;
      }

      return { response: fullResponse, usage };
    },
    metadata: { label: 'OpenAI Chat', category: 'AI', color: '#10a37f' },
  };
}
