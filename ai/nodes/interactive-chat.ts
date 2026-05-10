import type { NodeTypeDefinition, ExecutionContext } from "../../src/types/index.ts";
import { createOllamaProvider } from "../providers/ollama.ts";
import { createOpenAIProvider } from "../providers/openai.ts";
import { createOpenRouterProvider } from "../providers/openrouter.ts";
import type { ChatMessage, ToolCall, ToolDefinition, AIProvider } from "../providers/types.ts";
import { Colors, color, bold } from "../../src/utils/colors.ts";

export interface InteractiveTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

type ProviderType = "ollama" | "openai" | "openrouter";

function createProvider(type: ProviderType, config?: { apiKey?: string; baseUrl?: string }): AIProvider {
  switch (type) {
    case "ollama":
      return createOllamaProvider(config ? { baseUrl: config.baseUrl } : {});
    case "openai":
      return createOpenAIProvider(config || {});
    case "openrouter":
      return createOpenRouterProvider(config || {});
  }
}

export function getInteractiveChatNodeType(): NodeTypeDefinition {
  return {
    inputs: [
      { id: "provider", name: "Provider", type: "string", required: true, defaultValue: "ollama" },
      { id: "model", name: "Model", type: "string", required: true, defaultValue: "llama3" },
      { id: "systemPrompt", name: "System Prompt", type: "string", required: false },
      { id: "temperature", name: "Temperature", type: "number", required: false, defaultValue: 0.7 },
      { id: "streaming", name: "Streaming", type: "boolean", required: false, defaultValue: true },
      { id: "userMessage", name: "User Message", type: "string", required: false },
      { id: "initialPrompt", name: "Initial Prompt", type: "string", required: false },
      { id: "apiKey", name: "API Key", type: "string", required: false },
      { id: "baseUrl", name: "Base URL", type: "string", required: false },
      { id: "tools", name: "Tools", type: "any", required: false },
      { id: "sessionId", name: "Session ID", type: "string", required: false },
    ],
    outputs: [
      { id: "response", name: "Response", type: "string" },
      { id: "conversation", name: "Conversation", type: "array" },
      { id: "tokenCount", name: "Token Count", type: "number" },
    ],
    execute: async (inputs: unknown, context: ExecutionContext) => {
      const {
        provider: providerType = "ollama",
        model = "llama3",
        systemPrompt,
        temperature = 0.7,
        streaming = true,
        userMessage,
        initialPrompt,
        apiKey,
        baseUrl,
        tools: userTools,
        sessionId = context.nodeId,
      } = inputs as {
        provider?: ProviderType;
        model?: string;
        systemPrompt?: string;
        temperature?: number;
        streaming?: boolean;
        userMessage?: string;
        initialPrompt?: string;
        apiKey?: string;
        baseUrl?: string;
        tools?: InteractiveTool[];
        sessionId?: string;
      };

      const provider = createProvider(providerType, { ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}) });
      const toolDefinitions = userTools?.map((t) => t.definition);

      const convKey = `__interactive_chat_${sessionId}`;
      const existing = context.state.values.get(convKey) as ChatMessage[] | undefined;
      const messages: ChatMessage[] = existing ? existing.slice() : [];

      if (systemPrompt && messages.length === 0) {
        messages.push({ role: "system", content: systemPrompt });
      }

      let totalTokens = 0;
      let lastResponse = "";

      const isWorkflowMode = userMessage !== undefined && userMessage !== null;

      if (isWorkflowMode) {
        messages.push({ role: "user", content: userMessage });

        if (toolDefinitions && toolDefinitions.length > 0) {
          let toolCallDepth = 0;
          const maxToolCalls = 10;

          while (toolCallDepth < maxToolCalls) {
            toolCallDepth++;
            const response = await provider.chat({ model, messages, temperature, tools: toolDefinitions });
            const msg = response.message;
            messages.push(msg);

            if (response.usage) {
              totalTokens += response.usage.totalTokens || 0;
            }

            if (msg.tool_calls && msg.tool_calls.length > 0 && userTools?.length) {
              for (const tc of msg.tool_calls) {
                const tool = userTools.find((t) => t.definition.function.name === tc.function.name);
                if (tool) {
                  const args = JSON.parse(tc.function.arguments);
                  const result = await tool.execute(args);
                  messages.push({ role: "tool", content: result, tool_call_id: tc.id });
                }
              }
            } else {
              lastResponse = msg.content ?? "";
              break;
            }
          }
        } else if (streaming) {
          for await (const chunk of provider.streamChat({ model, messages, temperature })) {
            if (chunk.fullContent) {
              lastResponse = chunk.fullContent;
            } else if (chunk.delta) {
              lastResponse += chunk.delta;
            }
            context.graph.emit("llmStreamChunk", {
              nodeId: context.nodeId,
              state: { response: lastResponse, thinking: chunk.fullThinking || undefined, done: chunk.done ?? false },
            });
            if (chunk.done && chunk.usage) {
              totalTokens += chunk.usage.totalTokens || 0;
            }
          }
          messages.push({ role: "assistant", content: lastResponse });
        } else {
          const response = await provider.chat({ model, messages, temperature });
          lastResponse = response.message.content ?? "";
          messages.push(response.message);
          if (response.usage) {
            totalTokens += response.usage.totalTokens || 0;
          }
        }

        context.state.values.set(convKey, messages);
      } else {
        console.log();
        const title = userTools?.length ? "Code Assistant" : "Interactive Chat";
        console.log(`  ${color(Colors.arrow, Colors.accent)} ${color(bold(title), Colors.textPrimary)}`);
        console.log(`    ${color(Colors.dot, Colors.accent)} ${color("provider:", Colors.textMuted)} ${color(providerType, Colors.info)}`);
        console.log(`    ${color(Colors.dot, Colors.accent)} ${color("model:", Colors.textMuted)} ${color(model, Colors.info)}`);
        if (systemPrompt) {
          const truncated = systemPrompt.length > 50 ? systemPrompt.slice(0, 50) + "..." : systemPrompt;
          console.log(`    ${color(Colors.dot, Colors.accent)} ${color("system:", Colors.textMuted)} ${color(truncated, Colors.textSecondary)}`);
        }
        if (userTools?.length) {
          const names = userTools.map((t) => t.definition.function.name).join(", ");
          console.log(`    ${color(Colors.dot, Colors.accent)} ${color("tools:", Colors.textMuted)} ${color(names, Colors.info)}`);
        }
        console.log(`    ${color(Colors.dot, Colors.warning)} ${color("type exit, quit, or q to end", Colors.textMuted)}`);
        console.log();

        let firstTurn = true;
        while (true) {
          const input = firstTurn && initialPrompt
            ? (() => {
              console.log(`  ${color(Colors.arrow, Colors.info)} ${color("You:", Colors.info)} ${initialPrompt}`);
              return initialPrompt;
            })()
            : prompt(`  ${color(Colors.arrow, Colors.info)} ${color("You:", Colors.info)} `)?.trim() ?? "";

          const lower = input.toLowerCase();
          if (!input || lower === "exit" || lower === "quit" || lower === "q") {
            if (input && (lower === "exit" || lower === "quit" || lower === "q")) {
              console.log(`  ${color(Colors.warn, Colors.warning)} ${color("Session ended.", Colors.warning)}`);
            }
            break;
          }

          messages.push({ role: "user", content: input });

          let toolCallDepth = 0;
          const maxToolCalls = 10;
          while (toolCallDepth < maxToolCalls) {
            toolCallDepth++;
            const response = await provider.chat({ model, messages, temperature, tools: toolDefinitions });
            const msg = response.message;
            messages.push(msg);

            if (response.usage) {
              totalTokens += response.usage.totalTokens || 0;
            }

            if (msg.tool_calls && msg.tool_calls.length > 0 && userTools?.length) {
              Deno.stdout.writeSync(new TextEncoder().encode(
                `  ${color(Colors.arrow, Colors.accentHighlight)} ${color("tool calls:", Colors.accentHighlight)} `,
              ));
              const labels = msg.tool_calls.map((tc: ToolCall) => tc.function.name).join(", ");
              console.log(color(labels, Colors.textSecondary));

              for (const tc of msg.tool_calls) {
                const tool = userTools.find((t) => t.definition.function.name === tc.function.name);
                if (tool) {
                  const args = JSON.parse(tc.function.arguments);
                  const result = await tool.execute(args);
                  messages.push({ role: "tool", content: result, tool_call_id: tc.id });
                  console.log(`    ${color(tc.function.name + "()", Colors.textMuted)} ${color("→", Colors.gray)} ${color(String(result).slice(0, 200), Colors.textSecondary)}`);
                }
              }
            } else {
              const content = msg.content ?? "";
              if (content) {
                console.log(`  ${color(Colors.arrow, Colors.success)} ${color("AI:", Colors.success)} ${content}`);
              }
              lastResponse = content;
              break;
            }
          }

          if (toolCallDepth >= maxToolCalls) {
            console.log(`  ${color(Colors.warn, Colors.warning)} ${color("Max tool call depth reached.", Colors.warning)}`);
          }

          console.log();
          firstTurn = false;
        }

        context.state.values.set(convKey, messages);
      }

      return {
        response: lastResponse,
        conversation: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
        tokenCount: totalTokens,
      };
    },
    metadata: { label: "Interactive Chat", category: "AI", color: "#6c5ce7" },
  };
}
