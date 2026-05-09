import type {
  AIProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolCall,
} from './types.ts';

export function createOpenAIProvider(
  config: { apiKey?: string; baseUrl?: string } = {},
): AIProvider {
  const apiKey = config.apiKey || Deno.env.get('OPENAI_API_KEY');
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error(
      'OpenAI API key required. Set OPENAI_API_KEY env var or pass in config.',
    );
  }

  const chat = async (request: ChatRequest): Promise<ChatResponse> => {
    const messages = request.systemPrompt
      ? [
        { role: 'system' as const, content: request.systemPrompt },
        ...request.messages,
      ]
      : request.messages;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: messages.map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      stream: false,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };

    if (request.tools) {
      body.tools = request.tools;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat failed: ${response.statusText}`);
    }
    const data = await response.json();
    const choice = data.choices[0];
    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map(
      (tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }),
    );

    return {
      message: {
        role: 'assistant',
        content: choice.message.content ?? null,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      },
      usage: data.usage
        ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
        : undefined,
    };
  };

  async function* streamChat(
    request: ChatRequest,
  ): AsyncIterable<StreamChunk> {
    const messages = request.systemPrompt
      ? [
        { role: 'system' as const, content: request.systemPrompt },
        ...request.messages,
      ]
      : request.messages;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: messages.map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      stream: true,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };

    if (request.tools) {
      body.tools = request.tools;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenAI stream chat failed: ${response.statusText}`);
    }
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullThinking = '';
    let fullContent = '';
    const toolCallAccumulators: Map<
      number,
      { id?: string; type?: string; name?: string; arguments: string }
    > = new Map();

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
            const delta = chunk.choices?.[0]?.delta;
            const thinking =
              delta?.reasoning_content || delta?.thinking || '';

            if (thinking) fullThinking += thinking;

            if (delta?.content) {
              fullContent += delta.content;
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                if (!toolCallAccumulators.has(index)) {
                  toolCallAccumulators.set(index, { arguments: '' });
                }
                const acc = toolCallAccumulators.get(index)!;
                if (tc.id) acc.id = tc.id;
                if (tc.type) acc.type = tc.type;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) {
                  acc.arguments += tc.function.arguments;
                }
              }
            }

            const finishReason = chunk.choices?.[0]?.finish_reason;
            const isDone =
              finishReason !== null && finishReason !== undefined;

            const accumulatedToolCalls: ToolCall[] | undefined =
              toolCallAccumulators.size > 0
                ? Array.from(toolCallAccumulators.entries()).map(
                  ([index, acc]) => ({
                    id: acc.id || `call_${index}`,
                    type: 'function' as const,
                    function: {
                      name: acc.name || '',
                      arguments: acc.arguments,
                    },
                  }),
                )
                : undefined;

            yield {
              delta: delta?.content || '',
              thinking: thinking || undefined,
              done: isDone,
              fullContent,
              fullThinking: fullThinking || undefined,
              ...(accumulatedToolCalls && isDone
                ? { tool_calls: accumulatedToolCalls }
                : {}),
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
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data.map((m: { id: string }) => m.id);
  };

  return { chat, streamChat, listModels };
}
