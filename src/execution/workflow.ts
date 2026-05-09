import type {
  Workflow,
  GraphState,
  Graph,
  Node,
  LogLevel,
} from '../types/index.ts';
import { ExecutionLogger } from './log-engine.ts';

export class WorkflowImpl implements Workflow {
  private graph: Graph;
  private startNode: string;
  private endNode: string;
  private onStateUpdate?: (state: GraphState) => void;
  private conditionalEdges: Array<{
    sourceNodeId: string;
    condition: (state: GraphState) => string;
  }> = [];
  private logger: ExecutionLogger;
  private stepCount = 0;

  constructor(
    graph: Graph,
    config: {
      startNode: string;
      endNode: string;
      onStateUpdate?: (state: GraphState) => void;
      verbose?: boolean;
      logLevel?: LogLevel;
    },
  ) {
    this.graph = graph;
    this.startNode = config.startNode;
    this.endNode = config.endNode;
    this.onStateUpdate = config.onStateUpdate;

    let level: LogLevel = 'minimal';
    if (config.logLevel) {
      level = config.logLevel;
    } else if (config.verbose === true) {
      level = 'verbose';
    } else if (config.verbose === false) {
      level = 'silent';
    }
    this.logger = new ExecutionLogger({ logLevel: level });
  }

  addNode(
    type: string,
    config: {
      id?: string;
      data?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ): Node {
    return this.graph.addNode(type, config as any);
  }

  connect(source: string, target: string): Workflow {
    const parse = (s: string) => {
      if (s === 'START' || s === 'END') return { nodeId: s, portId: 'trigger' };
      const [nodeId, portId] = s.split('.');
      if (!portId) throw new Error(`Invalid format: ${s} (expected node.port)`);
      return { nodeId, portId };
    };

    const src = parse(source);
    const tgt = parse(target);

    this.graph.addEdge({
      sourceNodeId: src.nodeId,
      sourcePortId: src.portId,
      targetNodeId: tgt.nodeId,
      targetPortId: tgt.portId,
    });

    return this;
  }

  addConditionalEdge(config: {
    sourceNodeId: string;
    condition: (state: GraphState) => string;
  }): void {
    this.conditionalEdges.push(config);
  }

  async run(initialState?: GraphState): Promise<GraphState> {
    let state: GraphState = initialState || {
      values: new Map(),
      messages: [],
    };
    let currentNodeId = this.startNode;
    const visited = new Set<string>();
    this.stepCount = 0;

    this.logger.printHeader('WORKFLOW', 0, {
      Start: this.startNode,
      End: this.endNode,
    });

    const offStream = this.attachStreamHandler();

    while (currentNodeId !== this.endNode) {
      if (visited.has(currentNodeId)) {
        throw new Error(`Cycle detected at ${currentNodeId}`);
      }
      visited.add(currentNodeId);
      this.stepCount++;

      const node = this.graph.getNode(currentNodeId);
      if (!node) throw new Error(`Node ${currentNodeId} not found`);

      this.logger.printNodeStart(
        currentNodeId,
        node.type,
        this.stepCount,
        this.stepCount,
      );

      const inputs: Record<string, unknown> = {};
      const incomingEdges = this.graph
        .getEdgesForNode(currentNodeId)
        .filter((e) => e.targetNodeId === currentNodeId);
      for (const edge of incomingEdges) {
        inputs[edge.targetPortId] = state.values.get(
          `${edge.sourceNodeId}.${edge.sourcePortId}`,
        );
      }
      Object.assign(inputs, node.data);

      this.logger.printNodeInputs(inputs);

      const startTime = performance.now();
      const output = (await node.execute(inputs, {
        graph: this.graph,
        nodeId: currentNodeId,
        state,
        config: node.data,
      })) as Record<string, unknown>;

      const duration = performance.now() - startTime;

      for (const [portId, value] of Object.entries(output)) {
        state.values.set(`${currentNodeId}.${portId}`, value);
      }

      this.logger.printStreamSummary(currentNodeId);
      this.logger.printNodeDone(duration);

      this.onStateUpdate?.(state);

      const conditional = this.conditionalEdges.find(
        (e) => e.sourceNodeId === currentNodeId,
      );
      if (conditional) {
        const nextNodeId = conditional.condition(state);
        this.logger.info(`→ condition → ${nextNodeId}`);
        currentNodeId = nextNodeId;
      } else {
        const outgoing = this.graph
          .getEdgesForNode(currentNodeId)
          .filter((e) => e.sourceNodeId === currentNodeId);
        if (!outgoing.length) {
          throw new Error(`No outgoing edges from ${currentNodeId}`);
        }
        const nextNodeId = outgoing[0].targetNodeId;
        this.logger.info(`→ ${nextNodeId}`);
        currentNodeId = nextNodeId;
      }
    }

    offStream();
    this.logger.printFooter('success', [`${this.stepCount} steps`]);
    return state;
  }

  private attachStreamHandler(): () => void {
    const handler = (data: unknown) => {
      const chunk = data as {
        nodeId: string;
        state: { response: string; thinking?: string; done: boolean };
      };
      this.logger.handleStreamChunk(chunk);
    };
    this.graph.on('llmStreamChunk', handler);
    return () => this.graph.off('llmStreamChunk', handler);
  }
}
