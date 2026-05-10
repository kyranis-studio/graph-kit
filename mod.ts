import { GraphImpl as Graph } from './src/core/graph.ts';
import type { GraphConfig, NodeTypeDefinition } from './src/types/index.ts';
import {
  registerOllamaNodes,
  registerOpenAINodes,
  registerOpenRouterNodes,
  registerEmbeddingNodes,
  registerInteractiveChatNode,
} from './ai/mod.ts';

interface GraphKitObject {
  createGraph(config?: GraphConfig): Graph;
  fromJSON(
    json: string,
    nodeTypes?: Record<string, NodeTypeDefinition>,
  ): Graph;
}

export const GraphKit: GraphKitObject = {
  createGraph(config?: GraphConfig): Graph {
    if (config?.name && !config.metadata) {
      config.metadata = { name: config.name };
    }
    return new Graph(config);
  },

  fromJSON(
    json: string,
    nodeTypes?: Record<string, NodeTypeDefinition>,
  ): Graph {
    const graph = new Graph();
    if (nodeTypes) {
      for (const [type, def] of Object.entries(nodeTypes)) {
        graph.registerNodeType(type, def);
      }
    }
    const data = JSON.parse(json);
    graph.id = data.id;
    graph.metadata = data.metadata;

    if (data.nodes) {
      for (const n of data.nodes) {
        graph.addNode(n.type, {
          id: n.id,
          data: n.data,
          metadata: n.metadata,
        });
      }
    }
    if (data.edges) {
      for (const e of data.edges) {
        graph.addEdge({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          sourcePortId: e.sourcePortId,
          targetNodeId: e.targetNodeId,
          targetPortId: e.targetPortId,
          metadata: e.metadata,
        });
      }
    }

    return graph;
  },
};

export type { GraphImpl as Graph } from './src/core/graph.ts';
export type * from './src/types/index.ts';
export {
  registerOllamaNodes,
  registerOpenAINodes,
  registerOpenRouterNodes,
  registerEmbeddingNodes,
  registerInteractiveChatNode,
};
export { DebugExecutionEngine } from './src/execution/debug-engine.ts';
export type { NodeDebugInfo, DebugStreamState } from './src/execution/debug-engine.ts';
export { ExecutionEngine } from './src/execution/engine.ts';
export { WebUIExecutionEngine } from './src/web-ui/engine.ts';
export type { WebUIConfig } from './src/web-ui/engine.ts';
export { ExecutionLogger, ConsoleLogger, DefaultFormatter } from './src/execution/log-engine.ts';
export type { LogEngineConfig, LogEntry } from './src/execution/log-engine.ts';
