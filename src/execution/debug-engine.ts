import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';

export interface NodeDebugInfo {
  nodeId: string;
  nodeType: string;
  label?: string;
  inputs: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: unknown;
  predecessors: string[];
  successors: string[];
}

export class DebugExecutionEngine {
  #cancelled = false;
  #stepMode: boolean;
  #executionLog: NodeDebugInfo[] = [];
  #onNodeStart?: (info: NodeDebugInfo) => void;
  #onNodeComplete?: (info: NodeDebugInfo) => void;
  #onNodeError?: (info: NodeDebugInfo) => void;

  constructor(config?: {
    stepMode?: boolean;
    onNodeStart?: (info: NodeDebugInfo) => void;
    onNodeComplete?: (info: NodeDebugInfo) => void;
    onNodeError?: (info: NodeDebugInfo) => void;
  }) {
    this.#stepMode = config?.stepMode ?? false;
    this.#onNodeStart = config?.onNodeStart;
    this.#onNodeComplete = config?.onNodeComplete;
    this.#onNodeError = config?.onNodeError;
  }

  get executionLog(): ReadonlyArray<NodeDebugInfo> {
    return this.#executionLog;
  }

  get isCancelled(): boolean {
    return this.#cancelled;
  }

  cancel(): void {
    this.#cancelled = true;
  }

  reset(): void {
    this.#cancelled = false;
    this.#executionLog = [];
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    this.reset();
    const state: GraphState = initialState || { values: new Map(), messages: [] };
    const sortedNodes = topologicalSort(graph);

    console.log('\n=== Graph Execution Debug Mode ===');
    console.log(`Total nodes: ${sortedNodes.length}`);
    console.log(`Execution order: ${sortedNodes.join(' -> ')}`);
    console.log('Press SPACE to execute next node, ESC to cancel\n');

    for (const nodeId of sortedNodes) {
      if (this.#cancelled) {
        console.log('\n⚠ Execution cancelled by user');
        console.log(`Completed ${this.#executionLog.filter(n => n.status === 'completed').length}/${sortedNodes.length} nodes\n`);
        break;
      }

      const node = graph.getNode(nodeId)!;
      const debugInfo: NodeDebugInfo = {
        nodeId,
        nodeType: node.type,
        label: node.metadata?.label,
        inputs: {},
        status: 'pending',
        predecessors: graph.getPredecessors(nodeId).map(n => n.id),
        successors: graph.getSuccessors(nodeId).map(n => n.id),
      };

      const incomingEdges = graph.getEdgesForNode(nodeId).filter(e => e.targetNodeId === nodeId);
      for (const edge of incomingEdges) {
        const sourceOutputKey = `${edge.sourceNodeId}.${edge.sourcePortId}`;
        debugInfo.inputs[edge.targetPortId] = state.values.get(sourceOutputKey);
      }

      Object.assign(debugInfo.inputs, node.data);

      if (this.#stepMode) {
        await this.#waitForSpaceBar();
        if (this.#cancelled) continue;
      }

      debugInfo.status = 'running';
      this.#executionLog.push(debugInfo);
      this.#onNodeStart?.(debugInfo);

      this.#printNodeStart(debugInfo);

      const startTime = performance.now();

      graph.emit('nodeStart', { nodeId, inputs: debugInfo.inputs });
      try {
        const context: ExecutionContext = { graph, nodeId, state, config: node.data };
        const middlewares = (graph as any).getMiddlewares();
        let middlewareIndex = 0;

        const runWithMiddlewares = async () => {
          if (middlewareIndex < middlewares.length) {
            const middleware = middlewares[middlewareIndex++];
            await middleware(context, runWithMiddlewares);
          } else {
            const output = await node.execute(debugInfo.inputs, context);
            const outputObj = output as Record<string, unknown>;
            for (const [portId, value] of Object.entries(outputObj)) {
              state.values.set(`${nodeId}.${portId}`, value);
            }
            debugInfo.output = outputObj;
          }
        };

        await runWithMiddlewares();
        debugInfo.status = 'completed';
        debugInfo.duration = performance.now() - startTime;

        graph.emit('nodeComplete', { nodeId, output: debugInfo.output, inputs: debugInfo.inputs });
        this.#onNodeComplete?.(debugInfo);
        this.#printNodeComplete(debugInfo);
      } catch (error) {
        debugInfo.status = 'error';
        debugInfo.error = error;
        debugInfo.duration = performance.now() - startTime;

        graph.emit('nodeError', { nodeId, error });
        this.#onNodeError?.(debugInfo);
        this.#printNodeError(debugInfo);
        throw error;
      }
    }

    graph.emit('graphComplete', { state });
    this.#printSummary(sortedNodes.length);
    return state;
  }

  #printNodeStart(info: NodeDebugInfo): void {
    console.log('\n─────────────────────────────────────────');
    console.log(`▶ Executing: ${info.nodeId}`);
    console.log(`  Type: ${info.nodeType}`);
    if (info.label) console.log(`  Label: ${info.label}`);
    console.log(`  Predecessors: ${info.predecessors.length > 0 ? info.predecessors.join(', ') : 'none'}`);
    console.log(`  Successors: ${info.successors.length > 0 ? info.successors.join(', ') : 'none'}`);
    console.log(`  Inputs:`);
    for (const [key, value] of Object.entries(info.inputs)) {
      console.log(`    ${key}: ${this.#formatValue(value)}`);
    }
  }

  #printNodeComplete(info: NodeDebugInfo): void {
    console.log(`  ✓ Completed in ${info.duration!.toFixed(2)}ms`);
    console.log(`  Outputs:`);
    if (info.output) {
      for (const [key, value] of Object.entries(info.output)) {
        console.log(`    ${key}: ${this.#formatValue(value)}`);
      }
    }
  }

  #printNodeError(info: NodeDebugInfo): void {
    console.log(`  ✗ Failed after ${info.duration!.toFixed(2)}ms`);
    console.log(`  Error: ${info.error}`);
  }

  #printSummary(total: number): void {
    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    const errors = this.#executionLog.filter(n => n.status === 'error').length;
    const totalDuration = this.#executionLog.reduce((sum, n) => sum + (n.duration ?? 0), 0);

    console.log('\n═════════════════════════════════════════');
    console.log('Execution Summary');
    console.log(`  Nodes executed: ${completed}/${total}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total time: ${totalDuration.toFixed(2)}ms`);
    if (this.#cancelled) {
      console.log('  Status: CANCELLED');
    }
    console.log('═════════════════════════════════════════\n');
  }

  #formatValue(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  async #waitForSpaceBar(): Promise<void> {
    return new Promise<void>((resolve) => {
      const buffer = new Uint8Array(1);

      Deno.stdin.setRaw(true);

      const readKey = async () => {
        try {
          await Deno.stdin.read(buffer);
          const key = buffer[0];

          if (key === 32) {
            Deno.stdin.setRaw(false);
            resolve();
          } else if (key === 27) {
            Deno.stdin.setRaw(false);
            this.#cancelled = true;
            resolve();
          } else {
            readKey();
          }
        } catch {
          Deno.stdin.setRaw(false);
          resolve();
        }
      };

      readKey();
    });
  }
}
