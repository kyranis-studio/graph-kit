import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';

const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  gray: '\x1b[90m',
  white: '\x1b[37m',
  silver: '\x1b[92m',
  rose: '\x1b[95m',
  gold: '\x1b[93m',
  sky: '\x1b[94m',
  coral: '\x1b[91m',
  teal: '\x1b[96m',

  bgGray: '\x1b[100m',
  bgRose: '\x1b[45m',
  bgTeal: '\x1b[46m',

  line: '─',
  arrow: '▸',
  bullet: '·',
  check: '✓',
  cross: '✗',
  warn: '⚠',
  dot: '·',
};

function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${Colors.reset}`;
}

function bold(text: string): string {
  return `${Colors.bold}${text}${Colors.reset}`;
}

function dim(text: string): string {
  return `${Colors.dim}${text}${Colors.reset}`;
}

function box(label: string, content: string, colorCode: string): string {
  const border = color(Colors.line.repeat(50), colorCode);
  return `\n${border}\n${bold(color(` ${label}`, colorCode))}\n${border}\n${content}`;
}

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
    const title = color(' GRAPHKIT DEBUG EXECUTION ', Colors.bold + Colors.bgGray + Colors.white);
    const nodesInfo = dim(`Nodes: ${sortedNodes.length}`);
    const order = color('Order:', Colors.dim) + ' ' + sortedNodes.map((id, i) =>
      color(id, i === 0 ? Colors.teal : i === sortedNodes.length - 1 ? Colors.rose : Colors.sky)
    ).join(color(' → ', Colors.dim));

    console.log(`\n${title}\n`);
    console.log(`  ${nodesInfo}`);
    console.log(`  ${order}\n`);
    if (this.#stepMode) {
      console.log(`  ${color('[SPACE]', Colors.bold + Colors.gold)} continue  ${color('[ESC]', Colors.bold + Colors.coral)} cancel\n`);
    }
    console.log(color(Colors.line.repeat(50), Colors.dim));
  }

  #printNodeStart(info: NodeDebugInfo, index: number, total: number): void {
    const progress = `[${index + 1}/${total}]`;
    const nodeIcon = color(Colors.bullet, Colors.sky);
    const nodeIdText = bold(color(info.nodeId, Colors.sky));
    const typeText = dim(`(${info.nodeType})`);
    const labelText = info.label ? color(` "${info.label}"`, Colors.gold) : '';

    console.log(`\n${nodeIcon} ${progress} ${nodeIdText} ${typeText}${labelText}`);
    console.log(color(Colors.line.repeat(48), Colors.dim));

    if (info.predecessors.length > 0) {
      console.log(`  ${color('↑ from:', Colors.dim)} ${info.predecessors.map(id => color(id, Colors.teal)).join(', ')}`);
    }
    if (info.successors.length > 0) {
      console.log(`  ${color('↓ to:', Colors.dim)} ${info.successors.map(id => color(id, Colors.rose)).join(', ')}`);
    }

    if (Object.keys(info.inputs).length > 0) {
      console.log(`  ${color('Inputs:', Colors.dim)}`);
      for (const [key, value] of Object.entries(info.inputs)) {
        const valueStr = this.#formatValue(value);
        const preview = valueStr.length > 80 ? valueStr.slice(0, 80) + color('...', Colors.dim) : valueStr;
        console.log(`    ${color(key, Colors.sky)}: ${dim(preview)}`);
      }
    }
    console.log();
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
          Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('▸ thinking:', Colors.rose + Colors.dim)} `));
          started.thinking = true;
        }
        Deno.stdout.writeSync(new TextEncoder().encode(color(newThinking, Colors.rose)));
        this.#lastThinkingLength.set(nodeId, thinking.length);
      }

      if (newResponse.length > 0) {
        if (!started.response) {
          Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('▸ response:', Colors.teal + Colors.dim)} `));
          started.response = true;
        }
        Deno.stdout.writeSync(new TextEncoder().encode(color(newResponse, Colors.teal)));
        this.#lastResponseLength.set(nodeId, response.length);
      }
    
    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${dim('━ stream complete ━')}\n`));
    }
  }

  #printStreamSummary(streamInfo: { response: string; thinking?: string }): void {
    const parts: string[] = [];
    if (streamInfo.thinking) {
      parts.push(`${color('thinking:', Colors.rose)} ${streamInfo.thinking.length} chars`);
    }
    parts.push(`${color('response:', Colors.teal)} ${streamInfo.response.length} chars`);
    console.log(`  ${dim(parts.join('  '))}`);
  }

  #printNodeComplete(info: NodeDebugInfo): void {
    const icon = color(Colors.check, Colors.teal);
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.gold);
    console.log(`  ${icon} ${dim('done in')} ${time}`);

    if (info.output && Object.keys(info.output).length > 0) {
      console.log(`  ${color('Outputs:', Colors.dim)}`);
      for (const [key, value] of Object.entries(info.output)) {
        if (key === 'thinking' || key === 'response') continue;
        const valueStr = this.#formatValue(value);
        const preview = valueStr.length > 60 ? valueStr.slice(0, 60) + color('...', Colors.dim) : valueStr;
        console.log(`    ${color(key, Colors.sky)}: ${dim(preview)}`);
      }
    }
  }

  #printNodeError(info: NodeDebugInfo): void {
    const icon = color(Colors.cross, Colors.coral);
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.coral);
    console.log(`  ${icon} ${dim('failed after')} ${time}`);
    console.log(`  ${color('Error:', Colors.coral)} ${info.error}`);
  }

  #printCancel(total: number): void {
    console.log(`\n${color(`${Colors.warn} Execution cancelled`, Colors.gold)}`);
    console.log(dim(`  Completed ${this.#executionLog.filter(n => n.status === 'completed').length}/${total} nodes\n`));
  }

  #printSummary(total: number): void {
    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    const errors = this.#executionLog.filter(n => n.status === 'error').length;
    const totalDuration = this.#executionLog.reduce((sum, n) => sum + (n.duration ?? 0), 0);
    
    const statusColor = errors > 0 ? Colors.coral : Colors.teal;
    const statusText = errors > 0 ? 'FAILED' : this.#cancelled ? 'CANCELLED' : 'SUCCESS';
    const statusBg = errors > 0 ? Colors.bgRose : Colors.bgTeal;

    console.log(`\n${color(Colors.line.repeat(50), Colors.dim)}`);
    console.log(`  ${color(' EXECUTION SUMMARY ', Colors.bold + statusBg + Colors.white)}`);
    console.log(color(Colors.line.repeat(50), Colors.dim));
    console.log(`  ${color('Nodes:', Colors.dim)} ${completed}/${total}`);
    console.log(`  ${color('Errors:', Colors.dim)} ${errors > 0 ? color(String(errors), Colors.coral) : color('0', Colors.teal)}`);
    console.log(`  ${color('Time:', Colors.dim)} ${totalDuration.toFixed(1)}ms`);
    console.log(`  ${color('Status:', Colors.dim)} ${color(` ${statusText} `, Colors.bold + statusBg + Colors.white)}`);
    console.log(color(Colors.line.repeat(50), Colors.dim));
    console.log();
  }

  #formatValue(value: unknown): string {
    if (value === undefined) return dim('undefined');
    if (value === null) return dim('null');
    if (typeof value === 'string') return color(`"${value}"`, Colors.teal);
    if (typeof value === 'number') return color(String(value), Colors.gold);
    if (typeof value === 'boolean') return color(String(value), Colors.sky);
    if (typeof value === 'object') {
      try {
        return dim(JSON.stringify(value));
      } catch {
        return dim(String(value));
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
