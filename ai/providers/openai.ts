import type { AIProvider, ChatMessage, ChatRequest, ChatResponse } from './types.ts';

export function createOpenAIProvider(config: { apiKey?: string; baseUrl?: string } = {}) {
  const apiKey = config.apiKey || Deno.env.get('OPENAI_API_KEY');
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error('OpenAI API key required. Set OPENAI_API_KEY env var or pass in config.');
  }

  const chat = async (request: ChatRequest): Promise<ChatResponse> => {
    const messages = request.systemPrompt 
      ? [{ role: 'system' as const, content: request.systemPrompt }, ...request.messages]
      : request.messages;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI chat failed: ${response.statusText}`);
    const data = await response.json();
    return {
      message: { role: 'assistant', content: data.choices[0].message.content },
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  };

  const listModels = async (): Promise<string[]> => {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Failed to list models: ${response.statusText}`);
    const data = await response.json();
    return data.data.map((m: { id: string }) => m.id);
  };

  return { chat, listModels };
}
