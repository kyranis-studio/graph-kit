// Web UI — Complex Graph Stress Test (88 nodes, auto canvas rendering)
// Run: deno run --allow-net --allow-read examples/web-ui-complex.ts
// Open: http://localhost:3000
//
// Tests: hierarchical layout, minimap navigation, canvas rendering (>80 nodes),
//        zoom/pan performance, edge routing, viewport culling

import { GraphKit, WebUIExecutionEngine } from "../mod.ts";

const graph = GraphKit.createGraph({ name: "Complex Pipeline (88 nodes)" });

// ── Register node types ──

graph.registerNodeType("source", {
  inputs: [{ id: "seed", name: "Seed", type: "string", required: false }],
  outputs: [{ id: "data", name: "Data", type: "string" }],
  execute: async (inputs: unknown) => {
    const { seed } = inputs as { seed?: string };
    return { data: `source:${seed || "init"}` };
  },
});

graph.registerNodeType("process", {
  inputs: [{ id: "input", name: "Input", type: "string", required: true }],
  outputs: [{ id: "output", name: "Output", type: "string" }],
  execute: async (inputs: unknown) => {
    const { input } = inputs as { input: string };
    return { output: `${input}>>proc` };
  },
});

graph.registerNodeType("merge", {
  inputs: [
    { id: "a", name: "Input A", type: "string", required: true },
    { id: "b", name: "Input B", type: "string", required: true },
  ],
  outputs: [{ id: "result", name: "Result", type: "string" }],
  execute: async (inputs: unknown) => {
    const { a, b } = inputs as { a: string; b: string };
    return { result: `${a}+${b}` };
  },
});

graph.registerNodeType("collect", {
  inputs: [{ id: "items", name: "Items", type: "string", required: true }],
  outputs: [{ id: "collected", name: "Collected", type: "string" }],
  execute: async (inputs: unknown) => {
    const { items } = inputs as { items: string };
    return { collected: `[${items}]` };
  },
});

graph.registerNodeType("delay", {
  inputs: [{ id: "input", name: "Input", type: "string", required: true }],
  outputs: [{ id: "output", name: "Output", type: "string" }],
  execute: async (inputs: unknown) => {
    const { input } = inputs as { input: string };
    await new Promise((r) => setTimeout(r, 5));
    return { output: `${input}~~delay` };
  },
});

graph.registerNodeType("output", {
  inputs: [{ id: "final", name: "Final", type: "string", required: true }],
  outputs: [{ id: "result", name: "Result", type: "string" }],
  execute: async (inputs: unknown) => {
    const { final } = inputs as { final: string };
    return { result: `FINISHED: ${final}` };
  },
});

// ── Build graph ──

// Design: A layered grid with fan-out, fan-in, and cross-stage connections
//
//           ┌── s0-0 ── p0-0 ── d0-0 ──┐
//  sources ─┤          ...              ├── merges ── collects ── output
//           └── s4-4 ── p4-4 ── d4-4 ──┘
//
// Each layer fans out and cross-connects to create a dense but
// realistic DAG that exercises dagre layout, edge routing, and minimap.

const ids: string[] = [];
const add = (type: string, label: string, data?: Record<string, unknown>) => {
  const n = graph.addNode(type, { metadata: { label }, data });
  ids.push(n.id);
  return n;
};

function edge(src: { id: string }, port: string, tgt: { id: string }, tport: string) {
  graph.addEdge({ sourceNodeId: src.id, sourcePortId: port, targetNodeId: tgt.id, targetPortId: tport });
}

// ── Layer 0: Sources (8) ──
const sources: { id: string }[] = [];
for (let i = 0; i < 8; i++) {
  sources.push(add("source", `src-${i}`, { seed: `input-${i}` }));
}

// ── Layer 1: First process stage (16) ──
// Each source fans out to 2 process nodes
const stage1: { id: string }[] = [];
for (let i = 0; i < 8; i++) {
  const a = add("process", `proc-${i}a`);
  const b = add("process", `proc-${i}b`);
  edge(sources[i], "data", a, "input");
  edge(sources[i], "data", b, "input");
  stage1.push(a, b);
}

// ── Layer 2: Delay stage (16) ──
const stage2: { id: string }[] = [];
for (let i = 0; i < 16; i++) {
  const n = add("delay", `delay-${i}`);
  edge(stage1[i], "output", n, "input");
  stage2.push(n);
}

// ── Layer 3: Merge pairs (8) ──
// Merge adjacent pairs from stage2
const stage3: { id: string }[] = [];
for (let i = 0; i < 16; i += 2) {
  const n = add("merge", `merge-${i / 2}`);
  edge(stage2[i], "output", n, "a");
  edge(stage2[i + 1], "output", n, "b");
  stage3.push(n);
}

// ── Layer 4: Second process stage (16) ──
// Each merge fans out to 2 process nodes
const stage4: { id: string }[] = [];
for (let i = 0; i < 8; i++) {
  const a = add("process", `repro-${i}a`);
  const b = add("process", `repro-${i}b`);
  edge(stage3[i], "result", a, "input");
  edge(stage3[i], "result", b, "input");
  stage4.push(a, b);
}

// ── Layer 5: Cross-stage connections ──
// Additional edges between non-adjacent layers for complex routing
for (let i = 0; i < 8; i++) {
  edge(stage1[i * 2], "output", stage4[i * 2 + 1], "input");
}

// ── Layer 6: Collect stage (8) ──
// Collect adjacent pairs from stage4
const stage5: { id: string }[] = [];
for (let i = 0; i < 16; i += 2) {
  const n = add("collect", `collect-${i / 2}`);
  edge(stage4[i], "output", n, "items");
  edge(stage4[i + 1], "output", n, "items");
  stage5.push(n);
}

// ── Layer 7: More delay nodes (8) ──
const stage6: { id: string }[] = [];
for (let i = 0; i < 8; i++) {
  const n = add("delay", `final-delay-${i}`);
  edge(stage5[i], "collected", n, "input");
  stage6.push(n);
}

// ── Layer 8: Final merge cascade ──
const m0 = add("merge", "merge-A");
edge(stage6[0], "output", m0, "a");
edge(stage6[1], "output", m0, "b");

const m1 = add("merge", "merge-B");
edge(stage6[2], "output", m1, "a");
edge(stage6[3], "output", m1, "b");

const m2 = add("merge", "merge-C");
edge(stage6[4], "output", m2, "a");
edge(stage6[5], "output", m2, "b");

const m3 = add("merge", "merge-D");
edge(stage6[6], "output", m3, "a");
edge(stage6[7], "output", m3, "b");

const m4 = add("merge", "merge-AB");
edge(m0, "result", m4, "a");
edge(m1, "result", m4, "b");

const m5 = add("merge", "merge-CD");
edge(m2, "result", m5, "a");
edge(m3, "result", m5, "b");

const m6 = add("merge", "merge-final");
edge(m4, "result", m6, "a");
edge(m5, "result", m6, "b");

const finalNode = add("output", "final-output");
edge(m6, "result", finalNode, "final");

const totalNodes = ids.length;
console.log(`Built graph with ${totalNodes} nodes`);

// ── Execute ──
const engine = new WebUIExecutionEngine({ port: 3030 });

console.log("Web UI (complex graph): http://localhost:3030");
console.log(`Graph has ${totalNodes} nodes — auto-switches to canvas rendering (threshold: 80)`);
console.log("Features to test:");
console.log("  - Dagre hierarchical layout (left-to-right)");
console.log("  - Minimap navigation (bottom-right corner)");
console.log("  - Canvas rendering (auto-enabled for 80+ nodes)");
console.log("  - Zoom/pan with debounced RAF");
console.log("  - Edge routing with dagre-separated paths");
console.log("  - ResizeObserver + debounce");
console.log("  - Click mode badge to toggle debug mode");

const result = await engine.execute(graph);
console.log("\n=== Results ===");
for (const [key, value] of result.values) {
  if (key.includes("finalNode")) {
    console.log(`  ${key} = ${value}`);
  }
}
