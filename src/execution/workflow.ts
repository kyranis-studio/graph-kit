import type { Workflow, GraphState, Graph, Node } from '../types/index.ts';
import { GraphImpl } from '../core/graph.ts';

export class WorkflowImpl implements Workflow {
  #graph: Graph;
  #startNode: string;
  #endNode: string;
  #onStateUpdate?: (state: GraphState) => void;
  #conditionalEdges: Array<{ sourceNodeId: string; condition: (state: GraphState) => string }> = [];

  constructor(graph: Graph, config: Parameters<Workflow['addNode']>[1] & { startNode: string; endNode: string; onStateUpdate?: (state: GraphState) => void }) {
    this.#graph = graph;
    this.#startNode = config.startNode;
    this.#endNode = config.endNode;
    this.#onStateUpdate = config.onStateUpdate;
  }

  addNode(type: string, config: Parameters<Workflow['addNode']>[1]): Node {
    return this.#graph.addNode(type, config);
  }

  connect(source: string, target: string): Workflow {
    const parseTarget = (target: string) => {
      if (target === 'START' || target === 'END') return { nodeId: target, portId: undefined };
      const [nodeId, portId] = target.split('.');
      if (!portId) throw new Error(`Invalid target format: ${target}`);
      return { nodeId, portId };
    };

    const sourceParsed = parseTarget(source);
    const targetParsed = parseTarget(target);

    this.#graph.addEdge({
      sourceNodeId: sourceParsed.nodeId,
      sourcePortId: sourceParsed.portId || 'trigger',
      targetNodeId: targetParsed.nodeId,
      targetPortId: targetParsed.portId || 'input',
    });

    return this;
  }

  addConditionalEdge(config: Parameters<Workflow['addConditionalEdge']>[0]): void {
    this.#conditionalEdges.push(config);
  }

  async run(initialState?: GraphState): Promise<GraphState> {
    let state: GraphState = initialState || { values: new Map(), messages: [] };
    let currentNodeId = this.#startNode;
    const visited = new Set<string>();

    while (currentNodeId !== this.#endNode) {
      if (visited.has(currentNodeId)) throw new Error(`Cycle detected at ${currentNodeId}`);
      visited.add(currentNodeId);

      const node = this.#graph.getNode(currentNodeId);
      if (!node) throw new Error(`Node ${currentNodeId} not found`);

      const inputs: Record<string, unknown> = {};
      const incomingEdges = this.#graph.getEdgesForNode(currentNodeId).filter(e => e.targetNodeId === currentNodeId);
      for (const edge of incomingEdges) {
        const sourceOutputKey = `${edge.sourceNodeId}.${edge.sourcePortId}`;
        inputs[edge.targetPortId] = state.values.get(sourceOutputKey);
      }

      Object.assign(inputs, node.data);
      const output = await node.execute(inputs, { graph: this.#graph, nodeId: currentNodeId, state });
      
      for (const [portId, value] of Object.entries(output as Record<string, unknown>)) {
        state.values.set(`${currentNodeId}.${portId}`, value);
      }

      this.#onStateUpdate?.(state);

      const conditional = this.#conditionalEdges.find(e => e.sourceNodeId === currentNodeId);
      if (conditional) {
        currentNodeId = conditional.condition(state);
      } else {
        const outgoing = this.#graph.getEdgesForNode(currentNodeId).filter(e => e.sourceNodeId === currentNodeId);
        if (!outgoing.length) throw new Error(`No outgoing edges from ${currentNodeId}`);
        currentNodeId = outgoing[0].targetNodeId;
      }
    }

    return state;
  }
}
