import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';
import { Colors, color, bold, dim } from '../utils/colors.ts';

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

export interface StreamDebugState {
  nodeId: string;
  state: {
    response: string;
    thinking?: string;
    done: boolean;
  };
}

export class DebugExecutionEngine {
  #cancelled = false;
  #stepMode: boolean;
  #executionLog: NodeDebugInfo[] = [];
  #streamState: Map<string, { response: string; thinking?: string; done: boolean }> = new Map();
  #lastThinkingLength: Map<string, number> = new Map();
  #lastResponseLength: Map<string, number> = new Map();
  #onNodeStart?: (info: NodeDebugInfo) => void;
  #onNodeComplete?: (info: NodeDebugInfo) => void;
  #onNodeError?: (info: NodeDebugInfo) => void;
  #onStreamChunk?: (state: StreamDebugState) => void;
  #streamStarted: Map<string, { thinking: boolean; response: boolean }> = new Map();

  constructor(config?: {
    stepMode?: boolean;
    onNodeStart?: (info: NodeDebugInfo) => void;
    onNodeComplete?: (info: NodeDebugInfo) => void;
    onNodeError?: (info: NodeDebugInfo) => void;
    onStreamChunk?: (state: StreamDebugState) => void;
  }) {
    this.#stepMode = config?.stepMode ?? false;
    this.#onNodeStart = config?.onNodeStart;
    this.#onNodeComplete = config?.onNodeComplete;
    this.#onNodeError = config?.onNodeError;
    this.#onStreamChunk = config?.onStreamChunk;
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
    this.#streamState.clear();
    this.#lastThinkingLength.clear();
    this.#lastResponseLength.clear();
    this.#streamStarted.clear();
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    this.reset();
    const state: GraphState = initialState || { values: new Map(), messages: [] };
    const sortedNodes = topologicalSort(graph);

    graph.on('llmStreamChunk', (data: unknown) => {
      const chunk = data as StreamDebugState;
      this.#streamState.set(chunk.nodeId, chunk.state);
      this.#onStreamChunk?.(chunk);
      this.#printStreamChunk(chunk);
    });

    this.#printHeader(sortedNodes);

    for (let i = 0; i < sortedNodes.length; i++) {
      if (this.#cancelled) {
        this.#printCancel(sortedNodes.length);
        break;
      }

      const nodeId = sortedNodes[i];
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

      this.#printNodeStart(debugInfo, i, sortedNodes.length);

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

        const streamInfo = this.#streamState.get(nodeId);
        if (streamInfo) {
          this.#printStreamSummary(streamInfo);
        }

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

  #printHeader(sortedNodes: string[]): void {
    const firstNode = sortedNodes[0];
    const lastNode = sortedNodes[sortedNodes.length - 1];

    console.log(`\n${color('─'.repeat(50), Colors.dim)}`);
    console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${color('DEBUG MODE', Colors.gray)}`);
    console.log(color(Colors.line.repeat(50), Colors.dim));
    console.log(`  ${color('Nodes:', Colors.dim)} ${color(String(sortedNodes.length), Colors.sky)}  ${color('First:', Colors.dim)} ${color(firstNode, Colors.teal)}  ${color('Last:', Colors.dim)} ${color(lastNode, Colors.rose)}`);

    if (this.#stepMode) {
      console.log(`\n  ${color(Colors.bullet, Colors.gold)} ${color('Press', Colors.dim)} ${color('[SPACE]', Colors.bold + Colors.gold)} ${color('to continue or', Colors.dim)} ${color('[ESC]', Colors.bold + Colors.coral)} ${color('to cancel', Colors.dim)}\n`);
    }
  }

  #printNodeStart(info: NodeDebugInfo, index: number, total: number): void {
    const progress = color(`[${index + 1}/${total}]`, Colors.dim);
    const nodeIdText = bold(color(info.nodeId, Colors.sky));
    const typeText = color(info.nodeType, Colors.gray);
    const labelText = info.label ? ` ${color('"'+info.label+'"', Colors.gold)}` : '';

    console.log(`\n${color(Colors.line.repeat(48), Colors.dim)}`);
    console.log(`${color(Colors.arrow, Colors.teal)} ${progress} ${nodeIdText} ${typeText}${labelText}`);

    if (info.predecessors.length > 0) {
      console.log(`  ${color('←', Colors.dim)} ${info.predecessors.map(id => color(id, Colors.teal)).join(color('  ', Colors.dim))}`);
    }
    if (info.successors.length > 0) {
      console.log(`  ${color('→', Colors.dim)} ${info.successors.map(id => color(id, Colors.rose)).join(color('  ', Colors.dim))}`);
    }

    const inputEntries = Object.entries(info.inputs);
    if (inputEntries.length > 0) {
      console.log(`  ${color('Input', Colors.dim)}`);
      for (const [key, value] of inputEntries) {
        const preview = this.#formatValue(value);
        console.log(`    ${color(Colors.bullet, Colors.sky)} ${color(key, Colors.sky)} ${color('=', Colors.dim)} ${preview}`);
      }
    }
  }

  #printStreamChunk(chunk: StreamDebugState): void {
    const { nodeId } = chunk;
    const { thinking, response, done } = chunk.state;

    if (!this.#streamStarted.has(nodeId)) {
      this.#streamStarted.set(nodeId, { thinking: false, response: false });
    }
    const started = this.#streamStarted.get(nodeId)!;

    const prevThinkingLen = this.#lastThinkingLength.get(nodeId) || 0;
    const prevResponseLen = this.#lastResponseLength.get(nodeId) || 0;

    const newThinking = thinking ? thinking.slice(prevThinkingLen) : '';
    const newResponse = response.slice(prevResponseLen);

    if (thinking && newThinking.length > 0) {
      if (!started.thinking) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('thinking', Colors.gray)} ${color(Colors.line.repeat(38), Colors.dim)}\n  `));
        started.thinking = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newThinking, Colors.gray)));
      this.#lastThinkingLength.set(nodeId, thinking.length);
    }

    if (newResponse.length > 0) {
      if (!started.response) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('response', Colors.teal)} ${color(Colors.line.repeat(37), Colors.dim)}\n  `));
        started.response = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newResponse, Colors.teal)));
      this.#lastResponseLength.set(nodeId, response.length);
    }

    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color(Colors.line.repeat(40), Colors.dim)}\n`));
    }
  }

  #printStreamSummary(streamInfo: { response: string; thinking?: string }): void {
    console.log(`  ${color(Colors.bullet, Colors.silver)} ${color('stream:', Colors.dim)} ${color('thinking', Colors.gray)} ${color(String(streamInfo.thinking?.length || 0), Colors.gray)} ${color('response', Colors.teal)} ${color(String(streamInfo.response.length), Colors.teal)} ${color('chars', Colors.dim)}`);
  }

  #printNodeComplete(info: NodeDebugInfo): void {
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.gold);
    console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`);

    const outputEntries = Object.entries(info.output || {}).filter(([key]) => key !== 'thinking' && key !== 'response');
    if (outputEntries.length > 0) {
      console.log(`  ${color('Output', Colors.dim)}`);
      for (const [key, value] of outputEntries) {
        const preview = this.#formatValue(value);
        console.log(`    ${color(Colors.bullet, Colors.sky)} ${color(key, Colors.sky)} ${color('=', Colors.dim)} ${preview}`);
      }
    }
  }

  #printNodeError(info: NodeDebugInfo): void {
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.coral);
    console.log(`  ${color(Colors.cross, Colors.coral)} ${color('failed', Colors.coral)} ${color('after', Colors.dim)} ${time}`);
    console.log(`  ${color('Error:', Colors.coral)} ${color(String(info.error), Colors.coral)}`);
  }

  #printCancel(total: number): void {
    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    console.log(`\n${color(Colors.warn, Colors.gold)} ${color('CANCELLED', Colors.bold + Colors.bgGray + Colors.white)} ${color('after', Colors.dim)} ${color(String(completed), Colors.teal)} ${color(`of ${total} nodes`, Colors.dim)}\n`);
  }

  #printSummary(total: number): void {
    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    const errors = this.#executionLog.filter(n => n.status === 'error').length;
    const totalDuration = this.#executionLog.reduce((sum, n) => sum + (n.duration ?? 0), 0);

    const statusBg = errors > 0 ? Colors.bgRose : this.#cancelled ? Colors.bgGray : Colors.bgTeal;
    const statusText = errors > 0 ? 'FAILED' : this.#cancelled ? 'CANCELLED' : 'SUCCESS';

    console.log(`\n${color(Colors.line.repeat(50), Colors.dim)}`);
    console.log(`${color(' SUMMARY ', Colors.bold + statusBg + Colors.white)} ${color(statusText, statusBg ? Colors.white : Colors.teal)}`);
    console.log(color(Colors.line.repeat(50), Colors.dim));
    console.log(`  ${color('Completed:', Colors.dim)} ${color(String(completed), Colors.teal)} ${color('/', Colors.dim)} ${color(String(total), Colors.sky)} ${color('nodes', Colors.dim)}`);
    console.log(`  ${color('Errors:', Colors.dim)} ${errors > 0 ? color(String(errors), Colors.coral) : color('0', Colors.teal)}`);
    console.log(`  ${color('Duration:', Colors.dim)} ${color(totalDuration.toFixed(1) + 'ms', Colors.gold)}`);
    console.log(color(Colors.line.repeat(50), Colors.dim) + '\n');
  }

  #formatValue(value: unknown): string {
    if (value === undefined) return color('undefined', Colors.gray);
    if (value === null) return color('null', Colors.gray);
    if (typeof value === 'string') {
      const preview = value.length > 50 ? value.slice(0, 50) + '...' : value;
      return color(preview, Colors.teal);
    }
    if (typeof value === 'number') return color(String(value), Colors.gold);
    if (typeof value === 'boolean') return color(String(value), Colors.sky);
    if (typeof value === 'object') {
      try {
        const str = JSON.stringify(value);
        return str && str.length > 50 ? color(str.slice(0, 50) + '...', Colors.gray) : color(str || '', Colors.gray);
      } catch {
        return color(String(value), Colors.gray);
      }
    }
    return color(String(value), Colors.gray);
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
