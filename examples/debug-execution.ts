import { GraphKit } from "../mod.ts";
import { DebugExecutionEngine } from "../src/execution/debug-engine.ts";
import { Colors, color, bold } from "../src/utils/colors.ts";

const graph = GraphKit.createGraph({ metadata: { name: "Debug Example" } });

// Register node types
graph.registerNodeType("add", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number", required: false }],
  execute: async (inputs: unknown) => {
    const inputRecord = inputs as Record<string, unknown>;
    return { result: (inputRecord.a as number) + (inputRecord.b as number) };
  },
});

graph.registerNodeType("multiply", {
  inputs: [
    { id: "a", name: "A", type: "number", required: true },
    { id: "b", name: "B", type: "number", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "number", required: false }],
  execute: async (inputs: unknown) => {
    const inputRecord = inputs as Record<string, unknown>;
    return { result: (inputRecord.a as number) * (inputRecord.b as number) };
  },
  metadata: { label: "Multiply Node" },
});

graph.registerNodeType("log", {
  inputs: [{ id: "value", name: "Value", type: "any", required: true }],
  outputs: [{ id: "value", name: "Value", type: "any", required: false }],
  execute: async (inputs: unknown) => ({
    value: (inputs as Record<string, unknown>).value,
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
    console.log(color("[HOOK]", Colors.rose), color("Starting node:", Colors.dim), bold(color(info.nodeId, Colors.sky)));
  },
  onNodeComplete: (info) => {
    console.log(
      color("[HOOK]", Colors.teal), color("Completed node:", Colors.dim), bold(color(info.nodeId, Colors.sky)), color(`in ${info.duration?.toFixed(2)}ms`, Colors.gold),
    );
  },
  onNodeError: (info) => {
    console.error(color("[HOOK]", Colors.coral), bold(color("Error in node:", Colors.coral)), bold(color(info.nodeId, Colors.sky)), info.error);
  },
});

// Optional: also use middleware for timing
graph.use(async (context, next) => {
  const start = Date.now();
  await next();
  console.log(color("[MIDDLEWARE]", Colors.silver), bold(color(context.nodeId, Colors.sky)), color(`total: ${Date.now() - start}ms`, Colors.gold));
});

// Execute with debug engine
const result = await debugEngine.execute(graph);

console.log(color(Colors.line.repeat(60), Colors.dim));
console.log(`${color(' FINAL STATE ', Colors.bold + Colors.bgTeal + Colors.white)}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
for (const [key, value] of result.values) {
  console.log(`  ${color(Colors.bullet, Colors.sky)} ${color(key, Colors.sky)}${color(':', Colors.dim)} ${color(String(value), Colors.silver)}`);
}

console.log(`\n${color(Colors.line.repeat(60), Colors.dim)}`);
console.log(`${color(' EXECUTION LOG ', Colors.bold + Colors.bgGray + Colors.white)}`);
console.log(color(Colors.line.repeat(60), Colors.dim));
for (const entry of debugEngine.executionLog) {
  const statusColor = entry.status === 'completed' ? Colors.teal : entry.status === 'error' ? Colors.coral : Colors.sky;
  const icon = entry.status === 'completed' ? Colors.check : entry.status === 'error' ? Colors.cross : Colors.dot;
  console.log(`  ${color(icon, statusColor)} ${bold(color(entry.nodeId, Colors.sky))} ${color(`(${entry.nodeType})`, Colors.dim)}${color(':', Colors.dim)} ${color(entry.status, statusColor)}`);
}
console.log(color(Colors.line.repeat(60), Colors.dim) + '\n');
