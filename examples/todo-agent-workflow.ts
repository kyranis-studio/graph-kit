// WARNING: This is an educational example — not a production-ready assistant.
// The tools can read, write, and execute arbitrary files and commands.
// Use with extreme care and only in environments where you fully trust both
// the LLM model and the code it may write or run. Run at your own risk.

import { loadEnv } from "../src/utils/dotenv.ts";
import { GraphKit, registerInteractiveChatNode } from "../mod.ts";
import type { ToolDefinition } from "../ai/providers/types.ts";
import type { ExecutionContext } from "../src/types/index.ts";

interface InteractiveTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

interface SharedMemory {
  originalPrompt: string;
  todos: string[];
  statuses: string[];
  results: string[];
}

// ── Tools ────────────────────────────────────────────────────────────
const tools: InteractiveTool[] = [
  {
    definition: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path to the file" },
          },
          required: ["path"],
        },
      },
    },
    execute: async (args) => {
      try {
        return await Deno.readTextFile(args.path as string);
      } catch (e) {
        return `[error] ${(e as Error).message}`;
      }
    },
  },
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
        name: "create_directory",
        description: "Create a directory (including parent directories)",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to create" },
          },
          required: ["path"],
        },
      },
    },
    execute: async (args) => {
      try {
        await Deno.mkdir(args.path as string, { recursive: true });
        return `[ok] created directory ${args.path}`;
      } catch (e) {
        return `[error] ${(e as Error).message}`;
      }
    },
  },
  {
    definition: {
      type: "function",
      function: {
        name: "list_files",
        description: "List files in a directory",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Directory path (default: current)",
            },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      try {
        const dir = (args.path as string) || ".";
        const entries: string[] = [];
        for await (const entry of Deno.readDir(dir)) {
          entries.push(entry.name + (entry.isDirectory ? "/" : ""));
        }
        return entries.join("\n") || "(empty directory)";
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
            command: {
              type: "string",
              description: "Shell command to execute",
            },
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
  {
    definition: {
      type: "function",
      function: {
        name: "grep_search",
        description: "Search for a regex pattern in files",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Regex pattern" },
            glob: { type: "string", description: "File glob filter e.g. *.ts" },
          },
          required: ["pattern"],
        },
      },
    },
    execute: async (args) => {
      try {
        const rgArgs = ["--no-heading", "--color", "never"];
        if (args.glob) rgArgs.push("--glob", args.glob as string);
        rgArgs.push(args.pattern as string);
        const cmd = new Deno.Command("rg", { args: rgArgs });
        const out = await cmd.output();
        return new TextDecoder().decode(out.stdout).trim() || "(no matches)";
      } catch (e) {
        return `[error] ${(e as Error).message}`;
      }
    },
  },
];

console.warn(
  "\x1b[43m\x1b[30m WARNING \x1b[0m\x1b[33m This is an educational example \u2014 not a production-ready assistant.\x1b[0m",
);
console.warn(
  "\x1b[33m The tools can read, write, and execute arbitrary files and commands.\x1b[0m",
);
console.warn("\x1b[43m\x1b[30m WARNING \x1b[0m\n");

await loadEnv();

const graph = GraphKit.createGraph({ name: "Code Assistant Workflow" });
registerInteractiveChatNode(graph);

// ── Custom Node: user-prompt ─────────────────────────────────────────
graph.registerNodeType("user-prompt", {
  inputs: [],
  outputs: [
    { id: "text", name: "Text", type: "string" },
    { id: "hasInput", name: "Has Input", type: "boolean" },
  ],
  execute: async () => {
    const input = prompt("  \x1b[36m\u25b8 Task:\x1b[0m ")?.trim() ?? "";
    const isDone =
      !input || ["exit", "quit", "q"].includes(input.toLowerCase());
    if (isDone) console.log("\n  \x1b[33mSession ended.\x1b[0m");
    return { text: isDone ? "" : input, hasInput: !isDone };
  },
});

// ── Custom Node: parse-todos ─────────────────────────────────────────
graph.registerNodeType("parse-todos", {
  inputs: [
    {
      id: "orchestratorResponse",
      name: "Orchestrator Response",
      type: "string",
    },
  ],
  outputs: [
    { id: "todos", name: "Todos", type: "any" },
    { id: "hasTodos", name: "Has Todos", type: "boolean" },
  ],
  execute: async (inputs: any, context: ExecutionContext) => {
    const response = inputs.orchestratorResponse || "";
    const lines = response.split("\n");
    const todos: string[] = [];
    for (const line of lines) {
      const match = line.match(/^[\d\.\)\-\*\s]+(.+)/);
      if (match && match[1].trim()) {
        todos.push(match[1].trim());
      }
    }
    context.logger?.info(`plan created: ${todos.length} steps`);
    return { todos, hasTodos: todos.length > 0 };
  },
});

// ── Custom Node: shared-memory ───────────────────────────────────────
graph.registerNodeType("shared-memory", {
  inputs: [
    { id: "initPrompt", name: "Init Prompt", type: "string" },
    { id: "initTodos", name: "Init Todos", type: "any" },
    { id: "markStepResult", name: "Mark Step Result", type: "string" },
  ],
  outputs: [
    { id: "currentTodo", name: "Current Todo", type: "string" },
    { id: "currentStepNum", name: "Current Step Number", type: "number" },
    { id: "allDone", name: "All Done", type: "boolean" },
    { id: "hasTodos", name: "Has Todos", type: "boolean" },
  ],
  execute: async (inputs: any, context: ExecutionContext) => {
    const state = context.state;

    let memory = state.values.get("shared_memory") as SharedMemory | undefined;

    if (inputs.initTodos && (!memory || memory.todos.length === 0)) {
      memory = {
        originalPrompt: (inputs.initPrompt as string) || "",
        todos: structuredClone(inputs.initTodos) as string[],
        statuses: inputs.initTodos.map(() => "pending"),
        results: inputs.initTodos.map(() => ""),
      };
      if (memory.todos.length > 0) memory.statuses[0] = "in-progress";
      state.values.set("shared_memory", memory);
    }

    if (!memory) {
      memory = { originalPrompt: "", todos: [], statuses: [], results: [] };
    }

    const currentIdx = memory.statuses.indexOf("in-progress");
    const currentTodo = currentIdx !== -1 ? memory.todos[currentIdx] : "";
    const currentStepNum = currentIdx !== -1 ? currentIdx + 1 : 0;
    const hasTodos = memory.todos.length > 0;
    const allDone =
      memory.todos.length > 0 && memory.statuses.every((s) => s === "done");

    return { currentTodo, currentStepNum, allDone, hasTodos };
  },
});

// ── Custom Node: display-todos ───────────────────────────────────────
graph.registerNodeType("display-todos", {
  inputs: [{ id: "trigger", name: "Trigger", type: "any" }],
  outputs: [{ id: "status", name: "Status", type: "string" }],
  execute: async (_inputs: any, context: ExecutionContext) => {
    const memory = context.state.values.get("shared_memory") as SharedMemory;
    if (!memory || memory.todos.length === 0) return { status: "ok" };

    const logger = context.logger;
    console.log("");

    for (let i = 0; i < memory.todos.length; i++) {
      const s = memory.statuses[i] || "pending";
      if (s === "done") {
        logger?.success(`  step ${i + 1} [DONE] ${memory.todos[i]}`);
      } else if (s === "in-progress") {
        logger?.info(`  step ${i + 1} [ACTIVE] ${memory.todos[i]}`);
      } else {
        logger?.info(`  step ${i + 1} [PENDING] ${memory.todos[i]}`);
      }
    }

    console.log("");
    return { status: "ok" };
  },
});

// ── Custom Node: compose-prompt ──────────────────────────────────────
graph.registerNodeType("compose-prompt", {
  inputs: [{ id: "trigger", name: "Trigger", type: "any" }],
  outputs: [{ id: "prompt", name: "Prompt", type: "string" }],
  execute: async (_inputs: any, context: ExecutionContext) => {
    const memory = context.state.values.get("shared_memory") as SharedMemory;
    const currentIdx = memory.statuses.indexOf("in-progress");
    const currentStep = currentIdx !== -1 ? memory.todos[currentIdx] : "";
    const currentStepNum = currentIdx !== -1 ? currentIdx + 1 : 0;

    context.logger?.info(`--- step ${currentStepNum}: ${currentStep} ---`);

    return {
      prompt: [
        `## Original Request\n${memory.originalPrompt}`,
        ``,
        `## Progress`,
        memory.statuses
          .map((s, i) => {
            if (s === "done") return `[DONE] Step ${i + 1}: ${memory.todos[i]}`;
            if (s === "in-progress")
              return `[CURRENT] Step ${i + 1}: ${memory.todos[i]}`;
            return `[PENDING] Step ${i + 1}: ${memory.todos[i]}`;
          })
          .join("\n"),
        ``,
        `## Task`,
        `Execute step ${currentStepNum}: ${currentStep}`,
        `You have access to tools: read_file, write_file, create_directory, list_files, run_command, grep_search.`,
        `Use them to complete the step. After finishing, provide a summary of what you did.`,
      ].join("\n"),
    };
  },
});

// ── Custom Node: mark-step-done ──────────────────────────────────────
graph.registerNodeType("mark-step-done", {
  inputs: [{ id: "agentResponse", name: "Agent Response", type: "string" }],
  outputs: [
    { id: "response", name: "Response", type: "string" },
    { id: "summary", name: "Summary", type: "string" },
  ],
  execute: async (inputs: any, context: ExecutionContext) => {
    const agentResponse = inputs.agentResponse || "";

    const state = context.state;
    const memory = state.values.get("shared_memory") as SharedMemory;
    const currentIdx = memory.statuses.indexOf("in-progress");

    if (currentIdx !== -1) {
      memory.statuses[currentIdx] = "done";
      memory.results[currentIdx] = agentResponse;
      const nextPending = memory.statuses.indexOf("pending");
      if (nextPending !== -1) memory.statuses[nextPending] = "in-progress";
      state.values.set("shared_memory", memory);
    }

    const doneCount = memory.statuses.filter((s) => s === "done").length;
    context.logger?.success(
      `step ${currentIdx !== -1 ? currentIdx + 1 : "?"} complete (${doneCount}/${memory.todos.length})`,
    );

    // Print a snippet of the agent's response
    const snippet =
      agentResponse.length > 300
        ? agentResponse.slice(0, 300) + "..."
        : agentResponse;
    context.logger?.info(`agent: ${snippet}`);

    const summary = memory.todos
      .map((todo, i) => {
        const r = memory.results[i];
        return r
          ? `## Step ${i + 1}: ${todo}\n${r}`
          : `## Step ${i + 1}: ${todo}`;
      })
      .join("\n\n---\n\n");

    return { response: agentResponse, summary };
  },
});

// ── Custom Node: display-summary ─────────────────────────────────────
graph.registerNodeType("display-summary", {
  inputs: [{ id: "summary", name: "Summary", type: "string" }],
  outputs: [],
  execute: async (inputs: any, _context: ExecutionContext) => {
    if (inputs.summary) {
      console.log(`\n  \x1b[35m\x1b[1m\u25a0 ALL STEPS COMPLETE\x1b[0m\n`);
      console.log(inputs.summary);
      console.log("\n  " + "\x1b[90m" + "=".repeat(40) + "\x1b[0m\n");
    }
    return {};
  },
});

// ── Custom Node: silent-end ──────────────────────────────────────────
graph.registerNodeType("silent-end", {
  inputs: [],
  outputs: [],
  execute: async () => ({}),
});

// ── Add Nodes ────────────────────────────────────────────────────────
graph.addNode("user-prompt", { id: "prompt" });

graph.addNode("interactive-chat", {
  id: "orchestrator",
  metadata: { label: "Planner" },
  data: {
    provider: "ollama",
    model: "lfm2.5-thinking:latest",
    systemPrompt:
      "You are a senior software architect. Break the user's project request into a numbered list of concrete implementation steps. Include steps for setup, file creation, configuration, and verification. Output ONLY the numbered list.",
    temperature: 0.1,
    streaming: true,
  },
});

graph.addNode("interactive-chat", {
  id: "agent",
  metadata: { label: "Code Agent" },
  data: {
    provider: "ollama",
    model: "gemma4:e2b",
    systemPrompt:
      "You are a code assistant that builds projects. Use write_file to create files, create_directory for directories, run_command for shell operations, and read_file/list_files/grep_search to inspect existing code. Think step by step. Call one tool at a time. After completing all work for the step, provide a summary.",
    temperature: 0.3,
    streaming: false,
    tools,
  },
});

graph.addNode("parse-todos", { id: "parse-todos" });
graph.addNode("shared-memory", { id: "memory" });
graph.addNode("display-todos", { id: "display-todos" });
graph.addNode("compose-prompt", { id: "compose-prompt" });
graph.addNode("mark-step-done", { id: "mark-step-done" });
graph.addNode("display-summary", { id: "display-summary" });
graph.addNode("silent-end", { id: "end" });

// ── Edges ────────────────────────────────────────────────────────────
graph.addEdge({
  sourceNodeId: "prompt",
  sourcePortId: "text",
  targetNodeId: "orchestrator",
  targetPortId: "userMessage",
});

graph.addEdge({
  sourceNodeId: "orchestrator",
  sourcePortId: "response",
  targetNodeId: "parse-todos",
  targetPortId: "orchestratorResponse",
});

graph.addEdge({
  sourceNodeId: "orchestrator",
  sourcePortId: "response",
  targetNodeId: "memory",
  targetPortId: "initPrompt",
});

graph.addEdge({
  sourceNodeId: "parse-todos",
  sourcePortId: "todos",
  targetNodeId: "memory",
  targetPortId: "initTodos",
});

graph.addEdge({
  sourceNodeId: "memory",
  sourcePortId: "currentTodo",
  targetNodeId: "display-todos",
  targetPortId: "trigger",
});

graph.addEdge({
  sourceNodeId: "display-todos",
  sourcePortId: "status",
  targetNodeId: "compose-prompt",
  targetPortId: "trigger",
});

graph.addEdge({
  sourceNodeId: "compose-prompt",
  sourcePortId: "prompt",
  targetNodeId: "agent",
  targetPortId: "userMessage",
});

graph.addEdge({
  sourceNodeId: "agent",
  sourcePortId: "response",
  targetNodeId: "mark-step-done",
  targetPortId: "agentResponse",
});

graph.addEdge({
  sourceNodeId: "mark-step-done",
  sourcePortId: "response",
  targetNodeId: "memory",
  targetPortId: "markStepResult",
});

graph.addEdge({
  sourceNodeId: "mark-step-done",
  sourcePortId: "summary",
  targetNodeId: "display-summary",
  targetPortId: "summary",
});

// ── Workflow ─────────────────────────────────────────────────────────
console.log("\n  \x1b[1m=== CODE ASSISTANT WORKFLOW ===\x1b[0m");
console.log(
  "  Planner creates a plan \u2192 Agent builds each step with tools.\n",
);

const workflow = graph.createWorkflow({
  startNode: "prompt",
  endNode: "end",
  maxSteps: 100,
  logLevel: "verbose",
});

workflow.addConditionalEdge({
  sourceNodeId: "prompt",
  conditionLabel: "hasInput ? orchestrator : end",
  condition: (state) =>
    state.values.get("prompt.hasInput") ? "orchestrator" : "end",
});

workflow.addConditionalEdge({
  sourceNodeId: "memory",
  conditionLabel: "allDone ? display-summary : display-todos",
  condition: (state) => {
    const memory = state.values.get("shared_memory") as
      | SharedMemory
      | undefined;
    return memory && memory.statuses.every((s) => s === "done")
      ? "display-summary"
      : "display-todos";
  },
});

workflow.addConditionalEdge({
  sourceNodeId: "display-summary",
  conditionLabel: "→ end",
  condition: () => "end",
});

await workflow.run();
