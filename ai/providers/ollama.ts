import type { AIProvider, ChatMessage, ChatRequest, ChatResponse } from './types.ts';

export function createOllamaProvider(config: { baseUrl?: string } = {}) {
  const baseUrl = config.baseUrl || 'http://localhost:11434';

  const chat = async (request: ChatRequest): Promise<ChatResponse> => {
    const messages = request.systemPrompt 
      ? [{ role: 'system', content: request.systemPrompt }, ...request.messages]
      : request.messages;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: { temperature: request.temperature, num_predict: request.maxTokens },
      }),
    });

    if (!response.ok) throw new Error(`Ollama chat failed: ${response.statusText}`);
    const data = await response.json();
    return {
      message: { role: 'assistant', content: data.message.content },
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  };

  const listModels = async (): Promise<string[]> => {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`Failed to list models: ${response.statusText}`);
    const data = await response.json();
    return data.models.map((m: { name: string }) => m.name);
  };

  return { chat, listModels };
}
