import type { Graph, GraphState, ExecutionContext, LogLevel } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';
import { ExecutionLogger } from './log-engine.ts';

export type { LogLevel };

export class ExecutionEngine {
  private logger: ExecutionLogger;

  constructor(config?: { verbose?: boolean; logLevel?: LogLevel }) {
    let level: LogLevel = 'minimal';
    if (config?.logLevel) {
      level = config.logLevel;
    } else if (config?.verbose === true) {
      level = 'verbose';
    } else if (config?.verbose === false) {
      level = 'silent';
    }
    this.logger = new ExecutionLogger({ logLevel: level });
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    const state: GraphState = initialState || {
      values: new Map(),
      messages: [],
    };
    const sortedNodes = topologicalSort(graph);

    this.logger.printHeader('EXECUTION', sortedNodes.length, {
      Order: sortedNodes.length > 0
        ? `${sortedNodes[0]} → ${sortedNodes[sortedNodes.length - 1]}`
        : 'none',
    });

    const offStream = this.attachStreamHandler(graph);

    for (let i = 0; i < sortedNodes.length; i++) {
      const nodeId = sortedNodes[i];
      const node = graph.getNode(nodeId)!;
      const inputs = this.resolveInputs(graph, nodeId, state);

      Object.assign(inputs, node.data);

      this.logger.printNodeStart(nodeId, node.type, i + 1, sortedNodes.length);
      this.logger.printNodeInputs(inputs);

      const startTime = performance.now();
      graph.emit('nodeStart', { nodeId, inputs });

      try {
        const context: ExecutionContext = {
          graph,
          nodeId,
          state,
          config: node.data,
        };
        const middlewares = (graph as any).getMiddlewares?.() || [];
        await this.runWithMiddlewares(
          middlewares,
          context,
          node,
          inputs,
          state,
        );

        const duration = performance.now() - startTime;
        this.logger.printStreamSummary(nodeId);
        this.logger.printNodeDone(duration);
        graph.emit('nodeComplete', { nodeId, output: inputs, inputs });
      } catch (error) {
        this.logger.printNodeError(error);
        graph.emit('nodeError', { nodeId, error });
        offStream();
        throw error;
      }
    }

    offStream();
    this.logger.printFooter('success', [
      `${sortedNodes.length} nodes executed`,
    ]);
    graph.emit('graphComplete', { state });
    return state;
  }

  private resolveInputs(
    graph: Graph,
    nodeId: string,
    state: GraphState,
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    const incomingEdges = graph
      .getEdgesForNode(nodeId)
      .filter((e) => e.targetNodeId === nodeId);
    for (const edge of incomingEdges) {
      const key = `${edge.sourceNodeId}.${edge.sourcePortId}`;
      inputs[edge.targetPortId] = state.values.get(key);
    }
    return inputs;
  }

  private attachStreamHandler(graph: Graph): () => void {
    const handler = (data: unknown) => {
      const chunk = data as {
        nodeId: string;
        state: { response: string; thinking?: string; done: boolean };
      };
      this.logger.handleStreamChunk(chunk);
    };
    graph.on('llmStreamChunk', handler);
    return () => graph.off('llmStreamChunk', handler);
  }

  private async runWithMiddlewares(
    middlewares: Array<
      (context: ExecutionContext, next: () => Promise<void>) => Promise<void>
    >,
    context: ExecutionContext,
    node: { execute: (inputs: unknown, ctx: ExecutionContext) => unknown },
    inputs: Record<string, unknown>,
    state: GraphState,
  ): Promise<void> {
    let middlewareIndex = 0;

    const run = async (): Promise<void> => {
      if (middlewareIndex < middlewares.length) {
        const mw = middlewares[middlewareIndex++];
        await mw(context, run);
      } else {
        const output = (await node.execute(
          inputs,
          context,
        )) as Record<string, unknown>;
        for (const [portId, value] of Object.entries(output)) {
          state.values.set(`${context.nodeId}.${portId}`, value);
        }
      }
    };

    await run();
  }
}
