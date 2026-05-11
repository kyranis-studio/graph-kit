import { GraphKit, WebUIExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Calc Workflow" });

graph.registerNodeType("input-number", {
  inputs: [],
  outputs: [
    { id: "value", name: "Value", type: "number" },
    { id: "isPositive", name: "Is Positive", type: "boolean" },
  ],
  execute: async () => {
    const val = 42;
    return { value: val, isPositive: val >= 0 };
  },
});

graph.registerNodeType("double", {
  inputs: [{ id: "value", name: "Value", type: "number" }],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs: any) => {
    const v = (inputs.value as number) * 2;
    return { result: v };
  },
});

graph.registerNodeType("negate", {
  inputs: [{ id: "value", name: "Value", type: "number" }],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs: any) => {
    const v = (inputs.value as number) * -1;
    return { result: v };
  },
});

graph.registerNodeType("output", {
  inputs: [{ id: "value", name: "Value", type: "number" }],
  outputs: [],
  execute: async (inputs: any) => {
    console.log(`  Result: ${inputs.value}`);
    return {};
  },
});

// Nodes
graph.addNode("input-number", { id: "start" });
graph.addNode("double", { id: "double" });
graph.addNode("negate", { id: "negate" });
graph.addNode("output", { id: "end" });

// Edges from start
graph.addEdge({
  sourceNodeId: "start",
  sourcePortId: "value",
  targetNodeId: "double",
  targetPortId: "value",
});
graph.addEdge({
  sourceNodeId: "start",
  sourcePortId: "value",
  targetNodeId: "negate",
  targetPortId: "value",
});

// Edges to end
graph.addEdge({
  sourceNodeId: "double",
  sourcePortId: "result",
  targetNodeId: "end",
  targetPortId: "value",
});
graph.addEdge({
  sourceNodeId: "negate",
  sourcePortId: "result",
  targetNodeId: "end",
  targetPortId: "value",
});

// Workflow
const workflow = graph.createWorkflow({
  startNode: "start",
  endNode: "end",
  maxSteps: 10,
});

workflow.addConditionalEdge({
  sourceNodeId: "start",
  conditionLabel: "positive ? double : negate",
  condition: (state) =>
    state.values.get("start.isPositive") ? "double" : "negate",
});

const engine = new WebUIExecutionEngine({ port: 3030, debugMode: true });
console.log("\n  Open http://localhost:3030 in your browser\n");
await engine.execute(graph);
