import type { AIProvider, ChatMessage, ChatRequest, ChatResponse, StreamChunk, ToolCall } from './types.ts';

function generateCallId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `call_${hex}`;
}

export function createOllamaProvider(config: { baseUrl?: string } = {}) {
  const baseUrl = config.baseUrl || 'http://localhost:11434';

  const chat = async (request: ChatRequest): Promise<ChatResponse> => {
    const messages = request.systemPrompt 
      ? [{ role: 'system' as const, content: request.systemPrompt } as ChatMessage, ...request.messages]
      : request.messages;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: messages.map((m: ChatMessage) => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content ?? '' };
        if (m.tool_calls) {
          msg.tool_calls = m.tool_calls.map(tc => ({
            function: {
              name: tc.function.name,
              arguments: (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })(),
            },
          }));
        }
        return msg;
      }),
      stream: false,
      options: { temperature: request.temperature, num_predict: request.maxTokens },
    };

    if (request.tools) {
      body.tools = request.tools;
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Ollama chat failed: ${response.statusText}`);
    const data = await response.json();

    const toolCalls: ToolCall[] | undefined = data.message.tool_calls?.map((tc: any) => ({
      id: generateCallId(),
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments),
      },
    }));

    return {
      message: {
        role: 'assistant',
        content: data.message.content ?? null,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      },
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  };

  async function* streamChat(request: ChatRequest): AsyncIterable<StreamChunk> {
    const messages = request.systemPrompt 
      ? [{ role: 'system' as const, content: request.systemPrompt } as ChatMessage, ...request.messages]
      : request.messages;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: messages.map((m: ChatMessage) => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content ?? '' };
        if (m.tool_calls) {
          msg.tool_calls = m.tool_calls.map(tc => ({
            function: {
              name: tc.function.name,
              arguments: (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })(),
            },
          }));
        }
        return msg;
      }),
      stream: true,
      options: { temperature: request.temperature, num_predict: request.maxTokens },
    };

    if (request.tools) {
      body.tools = request.tools;
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Ollama stream chat failed: ${response.statusText}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullThinking = '';
    let fullContent = '';
    let finalToolCalls: ToolCall[] | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            const isDone = chunk.done ?? false;

            if (chunk.message?.thinking) {
              fullThinking += chunk.message.thinking;
            }
            
            if (chunk.message?.content) {
              fullContent += chunk.message.content;
            }

            // Ollama sends tool_calls in the final chunk
            if (isDone && chunk.message?.tool_calls) {
              finalToolCalls = chunk.message.tool_calls.map((tc: any, i: number) => ({
                id: generateCallId(),
                type: 'function' as const,
                function: {
                  name: tc.function.name,
                  arguments: typeof tc.function.arguments === 'string'
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments),
                },
              }));
            }

            yield {
              delta: chunk.message?.content || '',
              thinking: chunk.message?.thinking || undefined,
              done: isDone,
              fullContent,
              fullThinking: fullThinking || undefined,
              ...(finalToolCalls && isDone ? { tool_calls: finalToolCalls } : {}),
              usage: isDone ? chunk.usage : undefined,
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
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`Failed to list models: ${response.statusText}`);
    const data = await response.json();
    return data.models.map((m: { name: string }) => m.name);
  };

  return { chat, streamChat, listModels };
}
