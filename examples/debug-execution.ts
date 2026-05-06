import { GraphKit } from "../mod.ts";
import { DebugExecutionEngine } from "../src/execution/debug-engine.ts";
import { Colors, color } from "../src/utils/colors.ts";

const graph = GraphKit.createGraph({ metadata: { name: "Debug Example" } });

// Register node types
graph.registerNodeType("add", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs) => ({
    result: (inputs as any).a + (inputs as any).b,
  }),
});

graph.registerNodeType("multiply", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number" }],
  execute: async (inputs) => ({
    result: (inputs as any).a * (inputs as any).b,
  }),
  metadata: { label: "Multiply Node" },
});

graph.registerNodeType("log", {
  inputs: [{ id: "value", name: "Value", type: "any", required: true }],
  outputs: [{ id: "value", name: "Value", type: "any" }],
  execute: async (inputs) => ({
    value: inputs.value,
  }),
  metadata: { label: "Logger" },
});

// Build graph: (5 + 3) -> multiply by 2 -> log result
const n1 = graph.addNode("add", {
  id: "add1",
  data: { a: 5, b: 3 },
  metadata: { label: "Add 5 + 3" },
});
const n2 = graph.addNode("multiply", { id: "mul1", data: { b: 2 } });
const n3 = graph.addNode("log", { id: "log1" });

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

// Validate graph
const errors = graph.validate();
if (errors.length > 0) {
  console.error(color("Graph validation errors:", Colors.coral), errors);
  Deno.exit(1);
}

// Create debug engine with step mode enabled
const debugEngine = new DebugExecutionEngine({
  stepMode: false,
  onNodeStart: (info) => {
    // Custom hook - could send to monitoring service
    console.log(color("[HOOK] Starting node:", Colors.rose), color(info.nodeId, Colors.sky));
  },
  onNodeComplete: (info) => {
    console.log(
      color("[HOOK] Completed node:", Colors.teal), color(info.nodeId, Colors.sky), color(`(${info.nodeType})`, Colors.dim), color(`in ${info.duration?.toFixed(2)}ms`, Colors.gold),
    );
  },
  onNodeError: (info) => {
    console.error(color("[HOOK] Error in node:", Colors.coral), color(info.nodeId, Colors.sky), info.error);
  },
});

// Optional: also use middleware for timing
graph.use(async (context, next) => {
  const start = Date.now();
  await next();
  console.log(color("[MIDDLEWARE]", Colors.silver), color(context.nodeId, Colors.sky), color(`total: ${Date.now() - start}ms`, Colors.gold));
});

// Execute with debug engine
const result = await debugEngine.execute(graph);

console.log(color("\nFinal state:", Colors.teal));
for (const [key, value] of result.values) {
  console.log(`  ${color(key + ":", Colors.sky)} ${color(String(value), Colors.silver)}`);
}

console.log(color("\nExecution log:", Colors.teal));
for (const entry of debugEngine.executionLog) {
  const statusColor = entry.status === 'completed' ? Colors.teal : entry.status === 'error' ? Colors.coral : Colors.sky;
  console.log(`  ${color(entry.nodeId, Colors.sky)} ${color(`(${entry.nodeType})`, Colors.dim)}: ${color(entry.status, statusColor)}`);
}
