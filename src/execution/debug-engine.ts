import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';
import { Colors, color, bold } from '../utils/colors.ts';

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
  #lastThinkingLen: Map<string, number> = new Map();
  #lastResponseLen: Map<string, number> = new Map();
  #onNodeStart?: (info: NodeDebugInfo) => void;
  #onNodeComplete?: (info: NodeDebugInfo) => void;
  #onNodeError?: (info: NodeDebugInfo) => void;
  #onStreamChunk?: (state: StreamDebugState) => void;

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
    this.#lastThinkingLen.clear();
    this.#lastResponseLen.clear();
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    this.reset();
    const state: GraphState = initialState || { values: new Map(), messages: [] };
    const sortedNodes = topologicalSort(graph);

    graph.on('llmStreamChunk', (data: unknown) => {
      const chunk = data as StreamDebugState;
      this.#streamState.set(chunk.nodeId, chunk.state);
      this.#onStreamChunk?.(chunk);
      this.#writeStreamChunk(chunk);
    });

    this.#printHeader(sortedNodes);

    for (let i = 0; i < sortedNodes.length; i++) {
      if (this.#cancelled) break;

      const nodeId = sortedNodes[i];
      const node = graph.getNode(nodeId)!;

      const inputs: Record<string, unknown> = {};
      const incomingEdges = graph.getEdgesForNode(nodeId).filter(e => e.targetNodeId === nodeId);
      for (const edge of incomingEdges) {
        inputs[edge.targetPortId] = state.values.get(`${edge.sourceNodeId}.${edge.sourcePortId}`);
      }
      Object.assign(inputs, node.data);

      const info: NodeDebugInfo = {
        nodeId,
        nodeType: node.type,
        label: node.metadata?.label,
        inputs,
        status: 'pending',
        predecessors: graph.getPredecessors(nodeId).map(n => n.id),
        successors: graph.getSuccessors(nodeId).map(n => n.id),
      };

      this.#printNodeInfo(info, i, sortedNodes.length);

      if (this.#stepMode) {
        await this.#waitForStep();
        if (this.#cancelled) {
          console.log(`  ${color(Colors.warn, Colors.gold)} ${color('skipped', Colors.dim)}\n`);
          continue;
        }
      }

      info.status = 'running';
      this.#executionLog.push(info);
      this.#onNodeStart?.(info);
      graph.emit('nodeStart', { nodeId, inputs });
      const startTime = performance.now();

      try {
        const context: ExecutionContext = { graph, nodeId, state, config: node.data };
        const middlewares = (graph as any).getMiddlewares();
        let middlewareIndex = 0;

        const runWithMiddlewares = async (): Promise<void> => {
          if (middlewareIndex < middlewares.length) {
            await middlewares[middlewareIndex++](context, runWithMiddlewares);
          } else {
            const output = await node.execute(inputs, context) as Record<string, unknown>;
            for (const [portId, value] of Object.entries(output)) {
              state.values.set(`${nodeId}.${portId}`, value);
            }
            info.output = output;
          }
        };

        await runWithMiddlewares();
        info.status = 'completed';
        info.duration = performance.now() - startTime;

        this.#printStreamSummary(nodeId);
        this.#printNodeDone(info);
        graph.emit('nodeComplete', { nodeId, output: info.output, inputs });
        this.#onNodeComplete?.(info);
      } catch (error) {
        info.status = 'error';
        info.error = error;
        info.duration = performance.now() - startTime;

        graph.emit('nodeError', { nodeId, error });
        this.#onNodeError?.(info);
        this.#printNodeError(info);
        throw error;
      }
    }

    const completed = this.#executionLog.filter(n => n.status === 'completed').length;
    const errors = this.#cancelled ? 0 : this.#executionLog.filter(n => n.status === 'error').length;
    this.#printSummary(sortedNodes.length, completed, errors);
    graph.emit('graphComplete', { state });
    return state;
  }

  #printHeader(nodes: string[]): void {
    const line = Colors.line;
    console.log(`\n${color(line.repeat(60), Colors.gray)}`);
    console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('DEBUG MODE', Colors.sky))}`);
    console.log(color(line.repeat(60), Colors.dim));
    console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Nodes:', Colors.dim)} ${bold(color(String(nodes.length), Colors.sky))}  ${color('First:', Colors.dim)} ${color(nodes[0], Colors.teal)}  ${color('Last:', Colors.dim)} ${color(nodes[nodes.length - 1], Colors.rose)}`);
    console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Mode:', Colors.dim)} ${color(this.#stepMode ? 'STEP (SPACE=run, ESC=cancel)' : 'AUTO', this.#stepMode ? Colors.gold : Colors.teal)}`);

    if (this.#stepMode) {
      console.log(`\n  ${color(Colors.bullet, Colors.gold)} ${color('Press', Colors.dim)} ${color('[SPACE]', Colors.bold + Colors.gold)} ${color('to execute this node', Colors.dim)} ${color('or', Colors.dim)} ${color('[ESC]', Colors.bold + Colors.coral)} ${color('to cancel', Colors.dim)}\n`);
    }
  }

  #printNodeInfo(info: NodeDebugInfo, index: number, total: number): void {
    const progress = color(`[${index + 1}/${total}]`, Colors.dim);
    const nodeText = bold(color(info.nodeId, Colors.sky));
    const typeText = color(`(${info.nodeType})`, Colors.gray);
    const labelText = info.label ? ` ${color(info.label, Colors.gold)}` : '';

    console.log(`\n${color(Colors.arrow, Colors.sky)} ${progress} ${nodeText} ${typeText}${labelText}`);

    if (info.predecessors.length > 0) {
      const preds = info.predecessors.map(id => color(id, Colors.teal)).join(color(', ', Colors.dim));
      console.log(`  ${color('in ', Colors.dim)}${preds}`);
    }

    for (const [key, value] of Object.entries(info.inputs)) {
      console.log(`    ${color(Colors.bullet, Colors.sky)} ${color(key, Colors.gray)} ${color('=', Colors.dim)} ${this.#formatValue(value)}`);
    }
  }

  #writeStreamChunk(chunk: StreamDebugState): void {
    const { nodeId } = chunk;
    const { thinking, response, done } = chunk.state;

    const prevThink = this.#lastThinkingLen.get(nodeId) || 0;
    const prevResp = this.#lastResponseLen.get(nodeId) || 0;

    const newThink = thinking ? thinking.slice(prevThink) : '';
    const newResp = response.slice(prevResp);

    if (thinking && newThink.length > 0) {
      if (prevThink === 0) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('thinking', Colors.italic + Colors.gray)} ${color(Colors.line.repeat(30), Colors.dim)}\n  `));
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newThink, Colors.gray)));
      this.#lastThinkingLen.set(nodeId, thinking.length);
    }

    if (newResp.length > 0) {
      if (prevResp === 0) {
        const pad = Math.max(5, 40 - 'response'.length);
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('response', Colors.italic + Colors.teal)} ${color(Colors.line.repeat(pad), Colors.dim)}\n  `));
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newResp, Colors.teal)));
      this.#lastResponseLen.set(nodeId, response.length);
    }

    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color(Colors.line.repeat(40), Colors.dim)}\n`));
    }
  }

  #printStreamSummary(nodeId: string): void {
    const info = this.#streamState.get(nodeId);
    if (!info) return;
    const parts: string[] = [];
    if (info.thinking) parts.push(`${color('thinking', Colors.gray)} ${color(String(info.thinking.length), Colors.silver)}`);
    parts.push(`${color('response', Colors.teal)} ${color(String(info.response.length), Colors.silver)}`);
    console.log(`  ${color(Colors.dot, Colors.silver)} ${color('stream:', Colors.dim)} ${parts.join(color('  ', Colors.dim))} ${color('chars', Colors.dim)}`);
  }

  #printNodeDone(info: NodeDebugInfo): void {
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.gold);
    console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`);

    const extraOutput = Object.entries(info.output || {}).filter(([k]) => k !== 'thinking' && k !== 'response');
    for (const [key, value] of extraOutput) {
      console.log(`    ${color(Colors.bullet, Colors.rose)} ${color(key, Colors.gray)} ${color('=', Colors.dim)} ${this.#formatValue(value)}`);
    }
  }

  #printNodeError(info: NodeDebugInfo): void {
    const time = color(`${info.duration!.toFixed(1)}ms`, Colors.coral);
    console.log(`  ${color(Colors.cross, Colors.coral)} ${bold(color('FAILED', Colors.coral))} ${color('after', Colors.dim)} ${time}`);
    console.log(`  ${color('Error:', Colors.coral)} ${color(String(info.error), Colors.silver)}`);
  }

  #printSummary(total: number, completed: number, errors: number): void {
    const line = Colors.line;
    const statusBg = errors > 0 ? Colors.bgRose : this.#cancelled ? Colors.bgGray : Colors.bgTeal;
    const statusText = errors > 0 ? ' FAILED ' : this.#cancelled ? ' CANCELLED ' : ' SUCCESS ';

    console.log(`${color(line.repeat(60), Colors.dim)}`);
    console.log(`${color(statusText, Colors.bold + statusBg + Colors.white)} ${color('Execution finished', Colors.dim)}`);
    console.log(color(line.repeat(60), Colors.dim));
    console.log(`  ${color(Colors.bullet, Colors.teal)} ${color('Completed:', Colors.dim)} ${bold(color(String(completed), Colors.teal))} ${color('/', Colors.dim)} ${color(String(total), Colors.gray)} ${color('nodes', Colors.dim)}`);
    if (errors > 0) {
      console.log(`  ${color(Colors.bullet, Colors.coral)} ${color('Errors:', Colors.dim)} ${bold(color(String(errors), Colors.coral))}`);
    }
    console.log(`${color(line.repeat(60), Colors.dim)}\n`);
  }

  #formatValue(value: unknown): string {
    if (value === undefined) return color('undefined', Colors.gray);
    if (value === null) return color('null', Colors.gray);
    if (typeof value === 'string') {
      return color(value.length > 50 ? value.slice(0, 50) + '…' : value, Colors.teal);
    }
    if (typeof value === 'number') return color(String(value), Colors.gold);
    if (typeof value === 'boolean') return color(String(value), Colors.sky);
    if (typeof value === 'object') {
      try {
        const str = JSON.stringify(value);
        return color(str ? (str.length > 50 ? str.slice(0, 50) + '…' : str) : '', Colors.gray);
      } catch {
        return color(String(value), Colors.gray);
      }
    }
    return color(String(value), Colors.gray);
  }

  async #waitForStep(): Promise<void> {
    return new Promise<void>(resolve => {
      const buf = new Uint8Array(1);
      Deno.stdin.setRaw(true);

      const readKey = async () => {
        try {
          await Deno.stdin.read(buf);
          const key = buf[0];

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
