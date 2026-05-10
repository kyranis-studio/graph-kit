import type { NodeTypeDefinition, ExecutionContext } from "../../src/types/index.ts";
import { createOllamaProvider } from "../providers/ollama.ts";
import type { ChatMessage, ToolCall, ToolDefinition } from "../providers/types.ts";
import { Colors, color, bold } from "../../src/utils/colors.ts";

export interface InteractiveTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

export function getInteractiveChatNodeType(): NodeTypeDefinition {
  return {
    inputs: [
      { id: "model", name: "Model", type: "string", required: true, defaultValue: "llama3" },
      { id: "systemPrompt", name: "System Prompt", type: "string", required: false },
      { id: "temperature", name: "Temperature", type: "number", required: false, defaultValue: 0.7 },
      { id: "streaming", name: "Streaming", type: "boolean", required: false, defaultValue: true },
      { id: "initialPrompt", name: "Initial Prompt", type: "string", required: false },
      { id: "baseUrl", name: "Base URL", type: "string", required: false },
      { id: "tools", name: "Tools", type: "any", required: false },
    ],
    outputs: [
      { id: "response", name: "Response", type: "string" },
      { id: "conversation", name: "Conversation", type: "array" },
      { id: "tokenCount", name: "Token Count", type: "number" },
    ],
    execute: async (inputs: unknown, _context: ExecutionContext) => {
      const {
        model = "llama3",
        systemPrompt,
        temperature = 0.7,
        streaming = true,
        initialPrompt,
        baseUrl,
        tools: userTools,
      } = inputs as {
        model: string;
        systemPrompt?: string;
        temperature?: number;
        streaming?: boolean;
        initialPrompt?: string;
        baseUrl?: string;
        tools?: InteractiveTool[];
      };

      const provider = createOllamaProvider(baseUrl ? { baseUrl } : {});
      const messages: ChatMessage[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }

      const toolDefinitions = userTools?.map((t) => t.definition);

      let totalTokens = 0;
      let lastResponse = "";
      let firstTurn = true;

      console.log();
      const title = userTools?.length ? "Code Assistant" : "Interactive Chat";
      console.log(`  ${color(Colors.arrow, Colors.accent)} ${color(bold(title), Colors.textPrimary)}`);
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

          const response = await provider.chat({
            model,
            messages,
            temperature,
            tools: toolDefinitions,
          });

          const msg = response.message;
          messages.push(msg);

          if (response.usage) {
            totalTokens += response.usage.totalTokens || 0;
          }

          if (msg.tool_calls && msg.tool_calls.length > 0 && userTools?.length) {
            Deno.stdout.writeSync(
              new TextEncoder().encode(
                `  ${color(Colors.arrow, Colors.accentHighlight)} ${color("tool calls:", Colors.accentHighlight)} `,
              ),
            );
            const labels = msg.tool_calls.map((tc: ToolCall) => tc.function.name).join(", ");
            console.log(color(labels, Colors.textSecondary));

            for (const tc of msg.tool_calls) {
              const tool = userTools.find((t) => t.definition.function.name === tc.function.name);
              if (tool) {
                const args = JSON.parse(tc.function.arguments);
                const result = await tool.execute(args);
                messages.push({
                  role: "tool",
                  content: result,
                  tool_call_id: tc.id,
                });
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
