// WARNING: This is an educational example — not a production-ready assistant.
// The tools can read, write, and execute arbitrary files and commands.
// Use with extreme care and only in environments where you fully trust both
// the LLM model and the code it may write or run. Run at your own risk.

import { loadEnv } from "../src/utils/dotenv.ts";
import {
  GraphKit,
  registerInteractiveChatNode,
  DebugExecutionEngine,
} from "../mod.ts";
import type { ToolDefinition } from "../ai/providers/types.ts";

await loadEnv();

interface InteractiveTool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

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
        name: "list_files",
        description: "List files matching a glob pattern",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Glob pattern (e.g. '**/*.ts')",
            },
          },
          required: ["pattern"],
        },
      },
    },
    execute: async (args) => {
      try {
        const cmd = new Deno.Command("find", {
          args: [".", "-path", `./${args.pattern}`, "-type", "f"],
        });
        const out = await cmd.output();
        const text = new TextDecoder().decode(out.stdout).trim();
        return text || "(no matches)";
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
            include: {
              type: "string",
              description: "File glob filter (e.g. '*.ts')",
            },
          },
          required: ["pattern"],
        },
      },
    },
    execute: async (args) => {
      try {
        const rgArgs = ["--no-heading", "--color", "never"];
        if (args.include) rgArgs.push("--glob", args.include as string);
        rgArgs.push(args.pattern as string);
        const cmd = new Deno.Command("rg", { args: rgArgs });
        const out = await cmd.output();
        const text = new TextDecoder().decode(out.stdout).trim();
        return text || "(no matches)";
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

const graph = GraphKit.createGraph({ name: "Code Assistant" });
registerInteractiveChatNode(graph);

const chatNode = graph.addNode("interactive-chat", {
  metadata: { label: "Code Assistant" },
  data: {
    model: "gemma4:e2b",
    temperature: 0.3,
    streaming: false,
    systemPrompt:
      "You are a coding assistant that helps users develop software. You have access to tools for reading, writing, and searching files, and running shell commands. Use them to help the user with their code. Think step by step. Call one tool at a time and wait for the result before proceeding.",
    initialPrompt: "Introduce yourself and list the tools you have available.",
    tools,
  },
});

const engine = new DebugExecutionEngine({ stepMode: false });
const result = await engine.execute(graph);

const response = result.values.get(`${chatNode.id}.response`);
const conversation = result.values.get(`${chatNode.id}.conversation`);
const tokens = result.values.get(`${chatNode.id}.tokenCount`);

console.log(`\nSession complete. ${tokens ?? 0} tokens used.`);
if (response) {
  console.log(`Last response: ${(response as string).slice(0, 100)}...`);
}
