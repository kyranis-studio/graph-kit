// Web UI — Auto Mode (full-width graph, no step control)
// Run: deno run --allow-net --allow-read examples/web-ui-basic.ts
// Open: http://localhost:3000

import { GraphKit, WebUIExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Pipeline Demo" });

// ── Define node types ──
graph.registerNodeType("fetch", {
  inputs: [{ id: "url", name: "URL", type: "string", required: true }],
  outputs: [{ id: "data", name: "Data", type: "string" }],
  execute: async (inputs: unknown) => {
    const { url } = inputs as { url: string };
    return { data: `Fetched content from ${url}` };
  },
});

graph.registerNodeType("transform", {
  inputs: [{ id: "text", name: "Text", type: "string", required: true }],
  outputs: [{ id: "summary", name: "Summary", type: "string" }],
  execute: async (inputs: unknown) => {
    const { text } = inputs as { text: string };
    return { summary: `[Summarized] ${text.slice(0, 50)}...` };
  },
});

graph.registerNodeType("validate", {
  inputs: [{ id: "data", name: "Data", type: "string", required: true }],
  outputs: [{ id: "valid", name: "Valid", type: "boolean" }],
  execute: async () => ({ valid: true }),
});

// ── Build graph ──
const fetchNode = graph.addNode("fetch", {
  metadata: { label: "Fetch Data" },
  data: { url: "https://api.example.com/data" },
});

const transformNode = graph.addNode("transform", {
  metadata: { label: "Transform" },
});

const validateNode = graph.addNode("validate", {
  metadata: { label: "Validate" },
});

graph.addEdge({
  sourceNodeId: fetchNode.id,
  sourcePortId: "data",
  targetNodeId: transformNode.id,
  targetPortId: "text",
});

graph.addEdge({
  sourceNodeId: fetchNode.id,
  sourcePortId: "data",
  targetNodeId: validateNode.id,
  targetPortId: "data",
});

// ── Execute with auto mode (no split panel, no step control) ──
const engine = new WebUIExecutionEngine({
  port: 3030,
  // debugMode defaults to false — auto mode, full-width graph
});

console.log("Web UI (auto mode): http://localhost:3030");
console.log('Click "Execute" to run the full pipeline');
const result = await engine.execute(graph);

// Print results after execution completes
for (const [key, value] of result.values) {
  console.log(`  ${key} = ${value}`);
}
