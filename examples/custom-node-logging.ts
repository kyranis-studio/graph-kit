import { GraphKit, ExecutionEngine } from "../mod.ts";
import type { ExecutionContext } from "../src/types/index.ts";

const graph = GraphKit.createGraph({ name: "Custom Node Logging" });

graph.registerNodeType("data-processor", {
  inputs: [
    { id: "data", name: "Data", type: "string", required: true },
  ],
  outputs: [
    { id: "result", name: "Result", type: "string" },
  ],
  execute: async (inputs: any, ctx: ExecutionContext) => {
    const { logger } = ctx;

    logger?.info("starting data processing");
    logger?.printDebug("input_length", inputs.data.length);

    const steps = ["parsing", "validating", "transforming", "finalizing"];
    for (const step of steps) {
      logger?.debug(`step: ${step}`);
    }

    const result = `processed: ${inputs.data.toUpperCase()}`;
    logger?.printDebug("output_length", result.length);
    logger?.success("processing complete");

    return { result };
  },
});

const node = graph.addNode("data-processor", {
  data: { data: "hello world from graph-kit" },
});

const engine = new ExecutionEngine({ logLevel: "verbose" });
const state = await engine.execute(graph);
console.log(`\nResult: ${state.values.get(`${node.id}.result`)}`);
