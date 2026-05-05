import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';

export class ExecutionEngine {
  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    const state: GraphState = initialState || { values: new Map(), messages: [] };
    const sortedNodes = topologicalSort(graph);

    for (const nodeId of sortedNodes) {
      const node = graph.getNode(nodeId)!;
      const inputs: Record<string, unknown> = {};
      
      const incomingEdges = graph.getEdgesForNode(nodeId).filter(e => e.targetNodeId === nodeId);
      for (const edge of incomingEdges) {
        const sourceOutputKey = `${edge.sourceNodeId}.${edge.sourcePortId}`;
        inputs[edge.targetPortId] = state.values.get(sourceOutputKey);
      }

      Object.assign(inputs, node.data);

      graph.emit('nodeStart', { nodeId, inputs });
      try {
        const context: ExecutionContext = { graph, nodeId, state, config: node.data };
        const middlewares = (graph as any).getMiddlewares();
        let middlewareIndex = 0;

        const runWithMiddlewares = async () => {
          if (middlewareIndex < middlewares.length) {
            const middleware = middlewares[middlewareIndex++];
            await middleware(context, runWithMiddlewares);
          } else {
            const output = await node.execute(inputs, context);
            for (const [portId, value] of Object.entries(output as Record<string, unknown>)) {
              state.values.set(`${nodeId}.${portId}`, value);
            }
          }
        };

        await runWithMiddlewares();
        graph.emit('nodeComplete', { nodeId, output: inputs, inputs });
      } catch (error) {
        graph.emit('nodeError', { nodeId, error });
        throw error;
      }
    }

    graph.emit('graphComplete', { state });
    return state;
  }
}
