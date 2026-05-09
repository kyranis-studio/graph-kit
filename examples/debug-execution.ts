import { GraphKit } from "../mod.ts";
import { DebugExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Debug Example" });

graph.registerNodeType("add", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs: any) => ({ result: inputs.a + inputs.b }),
});

graph.registerNodeType("multiply", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs: any) => ({ result: inputs.a * inputs.b }),
});

graph.registerNodeType("log", {
  inputs: [{ id: "value", name: "Value", type: "number", required: true }],
  outputs: [{ id: "logged", name: "Logged", type: "number" }],
  execute: async (inputs: any) => {
    console.log(`  [log] value = ${inputs.value}`);
    return { logged: inputs.value };
  },
});

const n1 = graph.addNode("add", { data: { a: 10, b: 5 } });
const n2 = graph.addNode("multiply", { data: { b: 2 } });
const n3 = graph.addNode("log", {});

graph.addEdge({
  sourceNodeId: n1.id,
  sourcePortId: "result",
  targetNodeId: n2.id,
  targetPortId: "a",
});
graph.addEdge({
  sourceNodeId: n2.id,
  sourcePortId: "result",
  targetNodeId: n3.id,
  targetPortId: "value",
});

// Auto mode (non-interactive)
const debugEngine = new DebugExecutionEngine({
  stepMode: true,
  onNodeStart: (info) => console.log(`  [hook] starting: ${info.nodeId}`),
  onNodeComplete: (info) =>
    console.log(
      `  [hook] completed: ${info.nodeId} in ${info.duration?.toFixed(1)}ms`,
    ),
});

const result = await debugEngine.execute(graph);
console.log(`\nFinal Result: ${result.values.get(`${n3.id}.logged`)}`);
