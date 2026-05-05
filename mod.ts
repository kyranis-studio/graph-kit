import { GraphImpl as Graph } from './src/core/graph.ts';
import type { GraphConfig, NodeTypeDefinition } from './src/types/index.ts';
import { registerOllamaNodes, registerOpenAINodes, registerEmbeddingNodes } from './ai/mod.ts';

export const GraphKit = {
  createGraph(config?: GraphConfig): Graph {
    if (config?.name && !config.metadata) {
      config.metadata = { name: config.name };
    }
    return new Graph(config);
  },
  fromJSON(json: string, nodeTypes?: Record<string, NodeTypeDefinition>): Graph {
    const graph = new Graph();
    if (nodeTypes) {
      for (const [type, def] of Object.entries(nodeTypes)) {
        graph.registerNodeType(type, def);
      }
    }
    const data = JSON.parse(json);
    graph.id = data.id;
    graph.metadata = data.metadata;
    return graph;
  }
};

export type { GraphImpl as Graph } from './src/core/graph.ts';
export type * from './src/types/index.ts';
export { registerOllamaNodes, registerOpenAINodes, registerEmbeddingNodes };
export { DebugExecutionEngine } from './src/execution/debug-engine.ts';
export type { NodeDebugInfo } from './src/execution/debug-engine.ts';
