import type { AIProvider, ChatMessage, ChatRequest, ChatResponse, StreamChunk } from './types.ts';

export function createOpenRouterProvider(config: { apiKey?: string; baseUrl?: string } = {}) {
  const apiKey = config.apiKey || Deno.env.get('OPENROUTER_API_KEY');
  const baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';

  if (!apiKey) {
    throw new Error('OpenRouter API key required. Set OPENROUTER_API_KEY env var or pass in config.');
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
        'HTTP-Referer': Deno.env.get('APP_URL') || 'http://localhost',
        'X-Title': Deno.env.get('APP_NAME') || 'graph-kit',
      },
      body: JSON.stringify({
        model: request.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter chat failed: ${response.statusText}`);
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

  async function* streamChat(request: ChatRequest): AsyncIterable<StreamChunk> {
    const messages = request.systemPrompt
      ? [{ role: 'system' as const, content: request.systemPrompt }, ...request.messages]
      : request.messages;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': Deno.env.get('APP_URL') || 'http://localhost',
        'X-Title': Deno.env.get('APP_NAME') || 'graph-kit',
      },
      body: JSON.stringify({
        model: request.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter stream chat failed: ${response.statusText}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullThinking = '';
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const chunk = JSON.parse(trimmed.slice(6));
            const delta = chunk.choices?.[0]?.delta?.content || '';
            const thinking = chunk.choices?.[0]?.delta?.reasoning || chunk.choices?.[0]?.delta?.thinking || '';
            const isDone = chunk.choices?.[0]?.finish_reason !== null;

            if (thinking) fullThinking += thinking;
            if (delta) fullContent += delta;

            yield {
              delta,
              thinking,
              done: isDone && !delta && !thinking,
              fullContent,
              fullThinking: fullThinking || undefined,
            };
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  const listModels = async (): Promise<string[]> => {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Failed to list models: ${response.statusText}`);
    const data = await response.json();
    return data.data.map((m: { id: string }) => m.id);
  };

  return { chat, streamChat, listModels };
}
