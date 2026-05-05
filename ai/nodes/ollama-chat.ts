import type { NodeTypeDefinition, ExecutionContext } from '../../src/types/index.ts';
import { createOllamaProvider } from '../providers/ollama.ts';

export function getOllamaChatNodeType(): NodeTypeDefinition {
  const ollama = createOllamaProvider();

  return {
    inputs: [
      { id: 'prompt', name: 'Prompt', type: 'string', required: true },
      { id: 'model', name: 'Model', type: 'string', required: true, defaultValue: 'llama3' },
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
        for await (const chunk of ollama.streamChat({
          model: inputs.model,
          messages: messages as any,
          temperature: inputs.temperature,
        })) {
          // Chunks contain cumulative content
          fullResponse = chunk.fullContent || fullResponse;
          fullThinking = chunk.fullThinking || fullThinking;
          
          context.graph.emit('llmStreamChunk', {
            nodeId: context.nodeId,
            state: {
              response: fullResponse,
              thinking: fullThinking || undefined,
              done: chunk.done ?? false,
            },
          });
          
          if (chunk.done) {
            usage = chunk.usage;
          }
        }
      } else {
        const response = await ollama.chat({
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
    metadata: { label: 'Ollama Chat', category: 'AI', color: '#00b894' },
  };
}
