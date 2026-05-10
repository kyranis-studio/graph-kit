// WARNING: This is an educational example — not a production-ready assistant.
// The tools can read, write, and execute arbitrary files and commands.
// Use with extreme care and only in environments where you fully trust both
// the LLM model and the code it may write or run. Run at your own risk.

import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit, registerInteractiveChatNode } from "../mod.ts";
import type { ToolDefinition } from "../ai/providers/types.ts";

interface InteractiveTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

const tools: InteractiveTool[] = [
  {
    definition: {
      type: "function",
      function: {
        name: "write_file",
        description: "Write content to a file (creates or overwrites)",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path to the file" },
            content: { type: "string", description: "Content to write" },
          },
          required: ["path", "content"],
        },
      },
    },
    execute: async (args) => {
      try {
        await Deno.writeTextFile(args.path as string, args.content as string);
        return `[ok] wrote ${(args.content as string).length} bytes to ${args.path}`;
      } catch (e) {
        return `[error] ${(e as Error).message}`;
      }
    },
  },
  {
    definition: {
      type: "function",
      function: {
        name: "run_command",
        description: "Run a shell command and get its output",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to execute" },
          },
          required: ["command"],
        },
      },
    },
    execute: async (args) => {
      try {
        const cmd = new Deno.Command("/bin/sh", {
          args: ["-c", args.command as string],
        });
        const out = await cmd.output();
        const stdout = new TextDecoder().decode(out.stdout).trim();
        const stderr = new TextDecoder().decode(out.stderr).trim();
        const parts: string[] = [];
        if (stdout) parts.push(stdout);
        if (stderr) parts.push(`[stderr]\n${stderr}`);
        return parts.join("\n") || "(no output)";
      } catch (e) {
        return `[error] ${(e as Error).message}`;
      }
    },
  },
];

console.warn(
  "\x1b[43m\x1b[30m WARNING \x1b[0m\x1b[33m This is an educational example — not a production-ready assistant.\x1b[0m",
);
console.warn(
  "\x1b[33m The tools can read, write, and execute arbitrary files and commands.\x1b[0m",
);
console.warn(
  "\x1b[33m Use with extreme care and only in environments where you fully trust\x1b[0m",
);
console.warn(
  "\x1b[33m both the LLM model and the code it may write or run. Run at your own risk.\x1b[0m",
);
console.warn("\x1b[43m\x1b[30m WARNING \x1b[0m\x1b[33m \x1b[0m\n");

await loadEnv();

const graph = GraphKit.createGraph({ name: "Multi-Model Workflow" });

registerInteractiveChatNode(graph);

graph.registerNodeType("compose-context", {
  inputs: [
    { id: "userPrompt", name: "User Prompt", type: "string" },
    { id: "orchestratorOutput", name: "Orchestrator Output", type: "string" },
    { id: "thinkerOutput", name: "Thinker Output", type: "string" },
  ],
  outputs: [{ id: "text", name: "Text", type: "string" }],
  execute: async (inputs: any) => {
    const parts: string[] = [];
    if (inputs.userPrompt) {
      parts.push(`## Original Request\n\n${inputs.userPrompt}`);
    }
    if (inputs.orchestratorOutput) {
      parts.push(`## Orchestrator's Plan\n\n${inputs.orchestratorOutput}`);
    }
    if (inputs.thinkerOutput) {
      parts.push(`## Thinker's Analysis\n\n${inputs.thinkerOutput}`);
    }
    return { text: parts.join("\n\n---\n\n") };
  },
});

graph.registerNodeType("user-prompt", {
  inputs: [],
  outputs: [
    { id: "text", name: "Text", type: "string" },
    { id: "hasInput", name: "Has Input", type: "boolean" },
  ],
  execute: async () => {
    const input = prompt("  \x1b[36m\u25b8 You:\x1b[0m ")?.trim() ?? "";
    const isDone =
      !input || ["exit", "quit", "q"].includes(input.toLowerCase());
    if (isDone) {
      console.log("\n  \x1b[33mSession ended.\x1b[0m");
    }
    return { text: isDone ? "" : input, hasInput: !isDone };
  },
});

graph.registerNodeType("display", {
  inputs: [
    { id: "orchestrator", name: "Orchestrator", type: "string" },
    { id: "thinker", name: "Thinker", type: "string" },
    { id: "toolCaller", name: "Tool Caller", type: "string" },
  ],
  outputs: [],
  execute: async (inputs: any) => {
    if (inputs.orchestrator) {
      console.log(
        `  \x1b[32m\u25a0 Orchestrator:\x1b[0m ${inputs.orchestrator}`,
      );
    }
    if (inputs.thinker) {
      console.log(`  \x1b[33m\u25a0 Thinker:\x1b[0m ${inputs.thinker}`);
    }
    if (inputs.toolCaller) {
      console.log(`  \x1b[34m\u25a0 Tool Caller:\x1b[0m ${inputs.toolCaller}`);
    }
    return {};
  },
});

const promptNode = graph.addNode("user-prompt", { id: "prompt" });

const orchestrator = graph.addNode("interactive-chat", {
  id: "orchestrator",
  metadata: { label: "Orchestrator" },
  data: {
    provider: "ollama",
    model: "gemma4:e2b",
    systemPrompt:
      "You are an orchestrator. Respond to the user's request with a clear plan. Be concise and structured.",
    temperature: 0.3,
  },
});

const thinker = graph.addNode("interactive-chat", {
  id: "thinker",
  metadata: { label: "Thinker" },
  data: {
    provider: "ollama",
    model: "lfm2.5-thinking:latest",
    systemPrompt:
      "You are a deep reasoning engine. Think step by step, considering edge cases and optimizations.",
    temperature: 0.5,
  },
});

const toolCaller = graph.addNode("interactive-chat", {
  id: "tool-caller",
  metadata: { label: "Tool Caller" },
  data: {
    provider: "ollama",
    model: "functiongemma:latest",
    systemPrompt:
      "You generate clean implementations. Use the write_file tool to create the actual files and run_command to execute them. Always write working code.",
    temperature: 0.3,
    streaming: false,
    tools,
  },
});

const composeForThinker = graph.addNode("compose-context", {
  id: "compose-for-thinker",
});
const composeForToolCaller = graph.addNode("compose-context", {
  id: "compose-for-toolcaller",
});
const display = graph.addNode("display", { id: "display" });
const end = graph.addNode("user-prompt", { id: "end" });

// Edges serve dual purpose: data flow (input resolution) and workflow routing
graph.addEdge({
  sourceNodeId: "prompt",
  sourcePortId: "text",
  targetNodeId: "orchestrator",
  targetPortId: "userMessage",
});
graph.addEdge({
  sourceNodeId: "prompt",
  sourcePortId: "text",
  targetNodeId: "compose-for-thinker",
  targetPortId: "userPrompt",
});
graph.addEdge({
  sourceNodeId: "prompt",
  sourcePortId: "text",
  targetNodeId: "compose-for-toolcaller",
  targetPortId: "userPrompt",
});
graph.addEdge({
  sourceNodeId: "orchestrator",
  sourcePortId: "response",
  targetNodeId: "compose-for-thinker",
  targetPortId: "orchestratorOutput",
});
graph.addEdge({
  sourceNodeId: "orchestrator",
  sourcePortId: "response",
  targetNodeId: "compose-for-toolcaller",
  targetPortId: "orchestratorOutput",
});
graph.addEdge({
  sourceNodeId: "orchestrator",
  sourcePortId: "response",
  targetNodeId: "display",
  targetPortId: "orchestrator",
});
graph.addEdge({
  sourceNodeId: "compose-for-thinker",
  sourcePortId: "text",
  targetNodeId: "thinker",
  targetPortId: "userMessage",
});
graph.addEdge({
  sourceNodeId: "thinker",
  sourcePortId: "response",
  targetNodeId: "compose-for-toolcaller",
  targetPortId: "thinkerOutput",
});
graph.addEdge({
  sourceNodeId: "thinker",
  sourcePortId: "response",
  targetNodeId: "display",
  targetPortId: "thinker",
});
graph.addEdge({
  sourceNodeId: "compose-for-toolcaller",
  sourcePortId: "text",
  targetNodeId: "tool-caller",
  targetPortId: "userMessage",
});
graph.addEdge({
  sourceNodeId: "tool-caller",
  sourcePortId: "response",
  targetNodeId: "display",
  targetPortId: "toolCaller",
});

console.log();
console.log("  \x1b[1m=== Multi-Model Interactive Workflow ===\x1b[0m");
console.log(
  "  Type your questions \u2014 each message flows through all three models.",
);
console.log(
  "  Type \x1b[33mexit\x1b[0m, \x1b[33mquit\x1b[0m, or \x1b[33mq\x1b[0m to end.\n",
);
console.log(
  `  \x1b[32m\u25a0 Orchestrator:\x1b[0m  gemma4:e2b          (planning)`,
);
console.log(
  `  \x1b[33m\u25a0 Thinker:\x1b[0m       lfm2.5-thinking  (deep analysis)`,
);
console.log(
  `  \x1b[34m\u25a0 Tool Caller:\x1b[0m  functiongemma      (implementation)`,
);
console.log();

const workflow = graph.createWorkflow({
  startNode: "prompt",
  endNode: "end",
  maxSteps: 50,
  verbose: false,
});

workflow.addConditionalEdge({
  sourceNodeId: "prompt",
  condition: (state) => {
    const hasInput = state.values.get("prompt.hasInput") as boolean;
    return hasInput ? "orchestrator" : "end";
  },
});

workflow.addConditionalEdge({
  sourceNodeId: "display",
  condition: () => "prompt",
});

await workflow.run();
