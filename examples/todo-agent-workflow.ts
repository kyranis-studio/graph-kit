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

let sharedState: ExecutionContext["state"] | null = null;

function displayTodoList(state: ExecutionContext["state"]) {
  const todos = (state.values.get("__todo_items") as string[]) || [];
  const statuses = (state.values.get("__todo_statuses") as string[]) || [];

  console.log("\n  \x1b[1m\u25a0 Current Progress:\x1b[0m");
  for (let i = 0; i < todos.length; i++) {
    const status = statuses[i] || "pending";
    let icon: string;
    let color: string;
    if (status === "done") {
      icon = "\u2713";
      color = "\x1b[32m";
    } else if (status === "in-progress") {
      icon = "\u25b6";
      color = "\x1b[33m";
    } else {
      icon = "\u25cb";
      color = "\x1b[90m";
    }
    console.log(`  ${color}${icon}\x1b[0m Step ${i + 1}: ${todos[i]}`);
  }
  console.log();
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
        name: "mark_step_done",
        description:
          "Call this AFTER you have executed and verified a step. Marks the step as completed in the shared todo list.",
        parameters: {
          type: "object",
          properties: {
            stepNumber: {
              type: "number",
              description: "The 1-based step number you just completed",
            },
            result: {
              type: "string",
              description: "Summary of what was done and verification result",
            },
          },
          required: ["stepNumber", "result"],
        },
      },
    },
    execute: async (args) => {
      if (!sharedState) return "[error] no state reference";
      const stepNum = args.stepNumber as number;
      const result = args.result as string;
      const idx = stepNum - 1;
      const statuses =
        (sharedState.values.get("__todo_statuses") as string[]) || [];
      const results =
        (sharedState.values.get("__todo_results") as string[]) || [];

      if (idx >= 0 && idx < statuses.length && statuses[idx] !== "done") {
        statuses[idx] = "done";
        results[idx] = result;
        sharedState.values.set("__todo_statuses", statuses);
        sharedState.values.set("__todo_results", results);

        displayTodoList(sharedState);

        return `[ok] Step ${stepNum} marked as done.`;
      }
      return `[skip] Step ${stepNum} already done or invalid.`;
    },
  },
];

console.warn(
  "\x1b[43m\x1b[30m WARNING \x1b[0m\x1b[33m This is an educational example — not a production-ready assistant.\x1b[0m",
);
console.warn(
  "\x1b[33m The tools can read, write, and execute arbitrary files and commands.\x1b[0m",
);
console.warn("\x1b[43m\x1b[30m WARNING \x1b[0m\n");

await loadEnv();

const graph = GraphKit.createGraph({ name: "Todo Agent Workflow" });

registerInteractiveChatNode(graph);

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
    if (isDone) {
      console.log("\n  \x1b[33mSession ended.\x1b[0m");
    }
    return { text: isDone ? "" : input, hasInput: !isDone };
  },
});

graph.registerNodeType("parse-todos", {
  inputs: [
    {
      id: "orchestratorResponse",
      name: "Orchestrator Response",
      type: "string",
    },
  ],
  outputs: [
    { id: "currentTodo", name: "Current Todo", type: "string" },
    { id: "hasTodos", name: "Has Todos", type: "boolean" },
  ],
  execute: async (inputs: any, context: ExecutionContext) => {
    const response = inputs.orchestratorResponse || "";
    const lines = response.split("\n");
    const todos: string[] = [];
    for (const line of lines) {
      const match = line.match(/^[\d\.\)\-\*\s]+(.+)/);
      if (match && match[1].trim() && !line.toLowerCase().includes("plan")) {
        todos.push(match[1].trim());
      }
    }
    context.state.values.set("__todo_items", todos);
    context.state.values.set("__todo_results", []);
    context.state.values.set(
      "__todo_statuses",
      todos.map(() => "pending"),
    );
    context.state.values.set("process-result.done", false);
    return {
      currentTodo: todos[0] || "",
      hasTodos: todos.length > 0,
    };
  },
});

graph.registerNodeType("compose-plan", {
  inputs: [{ id: "trigger", name: "Trigger", type: "any" }],
  outputs: [{ id: "plan", name: "Plan", type: "string" }],
  execute: async (_inputs: any, context: ExecutionContext) => {
    sharedState = context.state;

    const todos = (context.state.values.get("__todo_items") as string[]) || [];
    const statuses =
      (context.state.values.get("__todo_statuses") as string[]) || [];
    const results =
      (context.state.values.get("__todo_results") as string[]) || [];
    const orchResponse =
      (context.state.values.get("orchestrator.response") as string) || "";

    const hasActive = statuses.includes("in-progress");
    if (!hasActive) {
      const firstPending = statuses.indexOf("pending");
      if (firstPending !== -1) {
        statuses[firstPending] = "in-progress";
        context.state.values.set("__todo_statuses", statuses);
      }
    }

    const parts: string[] = [];
    parts.push(`## ORIGINAL PLAN\n${orchResponse}\n`);
    parts.push(`## PROGRESS REPORT`);
    for (let i = 0; i < todos.length; i++) {
      const status = statuses[i] || "pending";
      const icon =
        status === "done"
          ? "[COMPLETED]"
          : status === "in-progress"
            ? "[ACTIVE]"
            : "[PENDING]";
      parts.push(`${icon} Step ${i + 1}: ${todos[i]}`);
      if (status === "done" && results[i]) {
        parts.push(`   > Result: ${results[i]}`);
      }
    }
    parts.push(
      "\nYOUR TASK: Execute the [ACTIVE] step. Use available tools. When done, call mark_step_done and then provide a brief summary of your work.",
    );

    return { plan: parts.join("\n") };
  },
});

graph.registerNodeType("display-todos", {
  inputs: [{ id: "trigger", name: "Trigger", type: "any" }],
  outputs: [{ id: "status", name: "Status", type: "string" }],
  execute: async (_inputs: any, context: ExecutionContext) => {
    displayTodoList(context.state);
    return { status: "ok" };
  },
});

graph.registerNodeType("process-result", {
  inputs: [{ id: "agentResponse", name: "Agent Response", type: "string" }],
  outputs: [
    { id: "done", name: "Done", type: "boolean" },
    { id: "summary", name: "Summary", type: "string" },
  ],
  execute: async (_inputs: any, context: ExecutionContext) => {
    const todos = (context.state.values.get("__todo_items") as string[]) || [];
    const statuses =
      (context.state.values.get("__todo_statuses") as string[]) || [];
    const results =
      (context.state.values.get("__todo_results") as string[]) || [];

    const allDone = statuses.length > 0 && statuses.every((s) => s === "done");
    const summary = todos
      .map((todo, i) => {
        const r = results[i];
        const h = `## Step ${i + 1}: ${todo}`;
        return r ? `${h}\n${r}` : h;
      })
      .join("\n\n---\n\n");

    context.state.values.set("process-result.done", allDone);
    return { done: allDone, summary };
  },
});

graph.registerNodeType("display-summary", {
  inputs: [{ id: "summary", name: "Summary", type: "string" }],
  outputs: [],
  execute: async (inputs: any) => {
    if (inputs.summary) {
      console.log(`\n  \x1b[35m\x1b[1m\u25a0 MISSION COMPLETE\x1b[0m\n`);
      console.log(inputs.summary);
      console.log("\n  " + "\x1b[90m" + "=".repeat(40) + "\x1b[0m\n");
    }
    return {};
  },
});

const orchestrator = graph.addNode("interactive-chat", {
  id: "orchestrator",
  metadata: { label: "Planner" },
  data: {
    provider: "ollama",
    model: "gemma4:e2b",
    systemPrompt:
      "You are a task planner. Break the user's request into a numbered list of small, actionable steps.\nOutput ONLY the numbered list.",
    temperature: 0.1,
    streaming: true,
  },
});

const agent = graph.addNode("interactive-chat", {
  id: "agent",
  metadata: { label: "Executor" },
  data: {
    provider: "ollama",
    model: "gemma4:e2b",
    systemPrompt:
      "You are a task executor. Use tools to complete the [ACTIVE] step. Always call mark_step_done when finished.",
    temperature: 0.1,
    streaming: true,
    tools,
  },
});

graph.addNode("user-prompt", { id: "prompt" });
graph.addNode("parse-todos", { id: "parse-todos" });
graph.addNode("compose-plan", { id: "compose-plan" });
graph.addNode("process-result", { id: "process-result" });
graph.addNode("display-todos", { id: "display-todos" });
graph.addNode("display-summary", { id: "display-summary" });
graph.addNode("user-prompt", { id: "end" });

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
  sourceNodeId: "parse-todos",
  sourcePortId: "currentTodo",
  targetNodeId: "display-todos",
  targetPortId: "trigger",
});
graph.addEdge({
  sourceNodeId: "display-todos",
  sourcePortId: "status",
  targetNodeId: "compose-plan",
  targetPortId: "trigger",
});
graph.addEdge({
  sourceNodeId: "compose-plan",
  sourcePortId: "plan",
  targetNodeId: "agent",
  targetPortId: "userMessage",
});
graph.addEdge({
  sourceNodeId: "agent",
  sourcePortId: "response",
  targetNodeId: "process-result",
  targetPortId: "agentResponse",
});
graph.addEdge({
  sourceNodeId: "process-result",
  sourcePortId: "done",
  targetNodeId: "display-todos",
  targetPortId: "trigger",
});
graph.addEdge({
  sourceNodeId: "process-result",
  sourcePortId: "summary",
  targetNodeId: "display-summary",
  targetPortId: "summary",
});

console.log("\n  \x1b[1m=== TODO AGENT WORKFLOW ===\x1b[0m");
console.log(
  "  Planner breaks down tasks \u2192 Executor handles them one by one.\n",
);

const workflow = graph.createWorkflow({
  startNode: "prompt",
  endNode: "end",
  maxSteps: 50,
  logLevel: "minimal",
});

workflow.addConditionalEdge({
  sourceNodeId: "prompt",
  condition: (state) =>
    state.values.get("prompt.hasInput") ? "orchestrator" : "end",
});

workflow.addConditionalEdge({
  sourceNodeId: "display-todos",
  condition: (state) =>
    state.values.get("process-result.done")
      ? "display-summary"
      : "compose-plan",
});

workflow.addConditionalEdge({
  sourceNodeId: "display-summary",
  condition: () => "prompt",
});

await workflow.run();
