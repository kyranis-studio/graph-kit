// Web UI — Quick start with custom node types
// Run: deno run --allow-net --allow-read examples/web-ui-execution.ts
// Open: http://localhost:3000

import { GraphKit, WebUIExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Quick Start" });

// ── Custom nodes that simulate a data pipeline ──
graph.registerNodeType("generator", {
  inputs: [],
  outputs: [{ id: "value", name: "Value", type: "number" }],
  execute: async (
    inputs: unknown,
    ctx: { config?: Record<string, unknown> },
  ) => {
    const base = (ctx.config?.base as number) || 0;
    return { value: base };
  },
});

graph.registerNodeType("adder", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs: unknown) => {
    const { a, b } = inputs as { a: number; b: number };
    return { result: (a as number) + (b as number) };
  },
});

graph.registerNodeType("printer", {
  inputs: [{ id: "msg", name: "Message", type: "string", required: true }],
  outputs: [{ id: "logged", name: "Logged", type: "boolean" }],
  execute: async (inputs: unknown) => {
    const { msg } = inputs as { msg: string };
    console.log("  ➤", msg);
    return { logged: true };
  },
});

// ── Wire up: generator → adder → printer ──
const gen = graph.addNode("generator", {
  metadata: { label: "Generate 42" },
  data: { base: 42 },
});

const add5 = graph.addNode("adder", {
  metadata: { label: "Add 5" },
  data: { b: 5 },
});

const printResult = graph.addNode("printer", {
  metadata: { label: "Print Result" },
});

graph.addEdge({
  sourceNodeId: gen.id,
  sourcePortId: "value",
  targetNodeId: add5.id,
  targetPortId: "a",
});

graph.addEdge({
  sourceNodeId: add5.id,
  sourcePortId: "result",
  targetNodeId: printResult.id,
  targetPortId: "msg",
});

// ── Execute ──
const engine = new WebUIExecutionEngine({ port: 3030 });

console.log("Web UI: http://localhost:3030");
const state = await engine.execute(graph);

console.log(`\nFinal value: ${state.values.get(`${add5.id}.result`)}`);
