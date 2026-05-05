import type { NodeTypeDefinition } from '../../src/types/index.ts';
import { createOllamaProvider } from '../providers/ollama.ts';

export function getOllamaChatNodeType(): NodeTypeDefinition {
  const ollama = createOllamaProvider();

  return {
    inputs: [
      { id: 'prompt', name: 'Prompt', type: 'string', required: true },
      { id: 'model', name: 'Model', type: 'string', required: true, defaultValue: 'llama3' },
      { id: 'temperature', name: 'Temperature', type: 'number', required: false, defaultValue: 0.7 },
      { id: 'systemPrompt', name: 'System Prompt', type: 'string', required: false },
    ],
    outputs: [
      { id: 'response', name: 'Response', type: 'string', required: false },
      { id: 'usage', name: 'Usage', type: 'object', required: false },
    ],
    execute: async (inputs: any) => {
      const messages = [];
      if (inputs.systemPrompt) messages.push({ role: 'system', content: inputs.systemPrompt });
      messages.push({ role: 'user', content: inputs.prompt });

      const response = await ollama.chat({
        model: inputs.model,
        messages: messages as any,
        temperature: inputs.temperature,
      });

      return { response: response.message.content, usage: response.usage };
    },
    metadata: { label: 'Ollama Chat', category: 'AI', color: '#00b894' },
  };
}
