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

    console.log(`\n${color(Colors.line.repeat(60), Colors.gray)}`);
    console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('DEBUG MODE', Colors.sky))}`);
    console.log(color(Colors.line.repeat(60), Colors.dim));
    console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Nodes:', Colors.dim)} ${bold(color(String(sortedNodes.length), Colors.sky))}  ${color('First:', Colors.dim)} ${color(firstNode, Colors.teal)}  ${color('Last:', Colors.dim)} ${color(lastNode, Colors.rose)}`);

    if (this.#stepMode) {
      console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Status:', Colors.dim)} ${color('WAITING FOR INPUT', Colors.gold)}`);
      console.log(`\n  ${color(Colors.bullet, Colors.gold)} ${color('Press', Colors.dim)} ${color('[SPACE]', Colors.bold + Colors.gold)} ${color('to step', Colors.dim)} ${color('or', Colors.dim)} ${color('[ESC]', Colors.bold + Colors.coral)} ${color('to cancel', Colors.dim)}\n`);
    } else {
      console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Status:', Colors.dim)} ${color('AUTO-EXECUTING', Colors.teal)}\n`);
    }
  }

  #printNodeStart(info: NodeDebugInfo, index: number, total: number): void {
    const progress = color(`[${index + 1}/${total}]`, Colors.dim);
    const nodeIdText = bold(color(info.nodeId, Colors.sky));
    const typeText = color(`(${info.nodeType})`, Colors.gray);
    const labelText = info.label ? ` ${color(info.label, Colors.gold)}` : '';

    console.log(`${color(Colors.arrow, Colors.sky)} ${progress} ${nodeIdText} ${typeText}${labelText}`);

    if (info.predecessors.length > 0) {
      const preds = info.predecessors.map(id => color(id, Colors.teal)).join(color(', ', Colors.dim));
      console.log(`  ${color('in ', Colors.dim)}${preds}`);
    }

    const inputEntries = Object.entries(info.inputs);
    if (inputEntries.length > 0) {
      for (const [key, value] of inputEntries) {
        const preview = this.#formatValue(value);
        console.log(`    ${color(Colors.bullet, Colors.sky)} ${color(key, Colors.gray)} ${color('=', Colors.dim)} ${preview}`);
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
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('thinking', Colors.italic + Colors.gray)} ${color(Colors.line.repeat(30), Colors.dim)}\n  `));
        started.thinking = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newThinking, Colors.gray)));
      this.#lastThinkingLength.set(nodeId, thinking.length);
    }

    if (newResponse.length > 0) {
      if (!started.response) {
        const lineLen = Math.max(5, 40 - 'response'.length);
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('response', Colors.italic + Colors.teal)} ${color(Colors.line.repeat(lineLen), Colors.dim)}\n  `));
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
    const thinkingText = streamInfo.thinking ? `${color('thinking', Colors.gray)} ${color(String(streamInfo.thinking.length), Colors.silver)} ` : '';
    console.log(`  ${color(Colors.dot, Colors.silver)} ${color('stream:', Colors.dim)} ${thinkingText}${color('response', Colors.teal)} ${color(String(streamInfo.response.length), Colors.silver)} ${color('chars', Colors.dim)}`);
  }

  #printNodeComplete(info: NodeDebugInfo): void {
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.gold);
    console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`);

    const outputEntries = Object.entries(info.output || {}).filter(([key]) => key !== 'thinking' && key !== 'response');
    if (outputEntries.length > 0) {
      for (const [key, value] of outputEntries) {
        const preview = this.#formatValue(value);
        console.log(`    ${color(Colors.bullet, Colors.rose)} ${color(key, Colors.gray)} ${color('=', Colors.dim)} ${preview}`);
      }
    }
    console.log('');
  }

  #printNodeError(info: NodeDebugInfo): void {
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.coral);
    console.log(`  ${color(Colors.cross, Colors.coral)} ${bold(color('FAILED', Colors.coral))} ${color('after', Colors.dim)} ${time}`);
    console.log(`  ${color('Error:', Colors.coral)} ${color(String(info.error), Colors.silver)}`);
    console.log('');
  }

  #printCancel(total: number): void {
    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    console.log(`\n${color(Colors.warn, Colors.gold)} ${color('CANCELLED', Colors.bold + Colors.bgGray + Colors.white)} ${color('after', Colors.dim)} ${bold(color(String(completed), Colors.teal))} ${color(`of ${total} nodes`, Colors.dim)}\n`);
  }

  #printSummary(total: number): void {
    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    const errors = this.#executionLog.filter(n => n.status === 'error').length;
    const totalDuration = this.#executionLog.reduce((sum, n) => sum + (n.duration ?? 0), 0);

    const statusBg = errors > 0 ? Colors.bgRose : this.#cancelled ? Colors.bgGray : Colors.bgTeal;
    const statusText = errors > 0 ? ' FAILED ' : this.#cancelled ? ' CANCELLED ' : ' SUCCESS ';

    console.log(`${color(Colors.line.repeat(60), Colors.dim)}`);
    console.log(`${color(statusText, Colors.bold + statusBg + Colors.white)} ${color('Execution finished in', Colors.dim)} ${bold(color(totalDuration.toFixed(1) + 'ms', Colors.gold))}`);
    console.log(color(Colors.line.repeat(60), Colors.dim));
    console.log(`  ${color(Colors.bullet, Colors.teal)} ${color('Completed:', Colors.dim)} ${bold(color(String(completed), Colors.teal))} ${color('/', Colors.dim)} ${color(String(total), Colors.gray)} ${color('nodes', Colors.dim)}`);
    if (errors > 0) {
      console.log(`  ${color(Colors.bullet, Colors.coral)} ${color('Errors:', Colors.dim)} ${bold(color(String(errors), Colors.coral))}`);
    }
    console.log(`${color(Colors.line.repeat(60), Colors.dim)}\n`);
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
