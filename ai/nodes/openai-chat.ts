import type { NodeTypeDefinition } from '../../src/types/index.ts';
import { createOpenAIProvider } from '../providers/openai.ts';

export function getOpenAIChatNodeType(): NodeTypeDefinition {
  const openai = createOpenAIProvider();

  return {
    inputs: [
      { id: 'prompt', name: 'Prompt', type: 'string', required: true },
      { id: 'model', name: 'Model', type: 'string', required: true, defaultValue: 'gpt-4' },
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

      const response = await openai.chat({
        model: inputs.model,
        messages: messages as any,
        temperature: inputs.temperature,
      });

      return { response: response.message.content, usage: response.usage };
    },
    metadata: { label: 'OpenAI Chat', category: 'AI', color: '#10a37f' },
  };
}
