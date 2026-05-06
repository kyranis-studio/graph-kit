import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';
import { Colors, color } from '../utils/colors.ts';

interface StreamState {
  response: string;
  thinking?: string;
  done: boolean;
}

export type LogLevel = 'silent' | 'minimal' | 'verbose';

export class ExecutionEngine {
  #logLevel: LogLevel;
  #streamState: Map<string, StreamState> = new Map();
  #lastThinkingLength: Map<string, number> = new Map();
  #lastResponseLength: Map<string, number> = new Map();
  #streamStarted: Map<string, { thinking: boolean; response: boolean }> = new Map();

  constructor(config?: { verbose?: boolean; logLevel?: LogLevel }) {
    if (config?.logLevel) {
      this.#logLevel = config.logLevel;
    } else if (config?.verbose === true) {
      this.#logLevel = 'verbose';
    } else if (config?.verbose === false) {
      this.#logLevel = 'silent';
    } else {
      this.#logLevel = 'minimal';
    }
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    const state: GraphState = initialState || { values: new Map(), messages: [] };
    const sortedNodes = topologicalSort(graph);

    if (this.#logLevel !== 'silent') {
      console.log(`\n${color(Colors.line.repeat(50), Colors.gray)}`);
      console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('EXECUTION', Colors.sky))}${color(` ${sortedNodes.length} nodes`, Colors.dim)}`);
      
      if (this.#logLevel === 'verbose') {
        console.log(color(Colors.line.repeat(50), Colors.dim));
        const order = sortedNodes.map((id, i) => color(id, i === 0 ? Colors.teal : i === sortedNodes.length - 1 ? Colors.rose : Colors.sky)).join(color(' → ', Colors.dim));
        console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Order:', Colors.dim)} ${order}`);
        console.log(color(Colors.line.repeat(50), Colors.dim) + '\n');
      } else {
        console.log(color(Colors.line.repeat(50), Colors.dim) + '\n');
      }
    }

    graph.on('llmStreamChunk', (data: unknown) => {
      const chunk = data as { nodeId: string; state: StreamState };
      this.#streamState.set(chunk.nodeId, chunk.state);
      if (this.#logLevel !== 'silent') {
        this.#printStreamChunk(chunk);
      }
    });

    for (let i = 0; i < sortedNodes.length; i++) {
      const nodeId = sortedNodes[i];
      const node = graph.getNode(nodeId)!;
      const inputs: Record<string, unknown> = {};
      
      const incomingEdges = graph.getEdgesForNode(nodeId).filter(e => e.targetNodeId === nodeId);
      for (const edge of incomingEdges) {
        const sourceOutputKey = `${edge.sourceNodeId}.${edge.sourcePortId}`;
        inputs[edge.targetPortId] = state.values.get(sourceOutputKey);
      }

      Object.assign(inputs, node.data);

      if (this.#logLevel !== 'silent') {
        const progress = color(`[${i + 1}/${sortedNodes.length}]`, Colors.dim);
        const nodeIdText = bold(color(nodeId, Colors.sky));
        const typeText = color(`(${node.type})`, Colors.gray);
        
        console.log(`${color(Colors.arrow, Colors.sky)} ${progress} ${nodeIdText} ${typeText}`);

        if (this.#logLevel === 'verbose' && Object.keys(inputs).length > 0) {
           for (const [k, v] of Object.entries(inputs)) {
             const preview = typeof v === 'string' ? `"${v.slice(0, 40)}${v.length > 40 ? '...' : ''}"` : String(v);
             console.log(`    ${color(Colors.bullet, Colors.sky)} ${color(k, Colors.gray)} ${color('=', Colors.dim)} ${color(preview, Colors.silver)}`);
           }
         }
      }

      const startTime = performance.now();
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
        const duration = performance.now() - startTime;
        
        if (this.#logLevel !== 'silent') {
          const time = color(`${duration.toFixed(1)}ms`, Colors.gold);
          if (this.#logLevel === 'verbose') {
            const streamInfo = this.#streamState.get(nodeId);
            if (streamInfo) {
              this.#printStreamSummary(streamInfo);
            }
            console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}\n`);
          } else {
            console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`);
          }
        }
        
        graph.emit('nodeComplete', { nodeId, output: inputs, inputs });
      } catch (error) {
        if (this.#logLevel !== 'silent') {
          console.log(`  ${color(Colors.cross, Colors.coral)} ${bold(color('FAILED', Colors.coral))}: ${color(String(error), Colors.silver)}\n`);
        }
        graph.emit('nodeError', { nodeId, error });
        throw error;
      }
    }

    if (this.#logLevel !== 'silent') {
      console.log(color(Colors.line.repeat(50), Colors.dim));
      console.log(`${color(' COMPLETED ', Colors.bold + Colors.bgTeal + Colors.white)}\n`);
    }

    graph.emit('graphComplete', { state });
    return state;
  }

  #printStreamChunk(chunk: { nodeId: string; state: StreamState }): void {
    const { nodeId } = chunk;
    const { thinking, response, done } = chunk.state;
    
    if (!this.#streamStarted.has(nodeId)) {
      this.#streamStarted.set(nodeId, { thinking: false, response: false });
    }
    const started = this.#streamStarted.get(nodeId)!;
    
    const prevThinkingLen = this.#lastThinkingLength.get(nodeId) || 0;
    const prevResponseLen = this.#lastResponseLength.get(nodeId) || 0;
    
    // Only show thinking in verbose mode
    if (this.#logLevel === 'verbose' && thinking) {
      const newThinking = thinking.slice(prevThinkingLen);
      if (newThinking.length > 0) {
        if (!started.thinking) {
          Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('thinking', Colors.italic + Colors.gray)} ${color(Colors.line.repeat(30), Colors.dim)}\n  `));
          started.thinking = true;
        }
        Deno.stdout.writeSync(new TextEncoder().encode(color(newThinking, Colors.gray)));
        this.#lastThinkingLength.set(nodeId, thinking.length);
      }
    }

    // Show response in both minimal and verbose modes
    const newResponse = response.slice(prevResponseLen);
    if (newResponse.length > 0) {
      if (!started.response) {
        if (this.#logLevel === 'verbose') {
          const lineLen = Math.max(5, 40 - 'response'.length);
          Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('response', Colors.italic + Colors.teal)} ${color(Colors.line.repeat(lineLen), Colors.dim)}\n  `));
        } else {
          Deno.stdout.writeSync(new TextEncoder().encode(`  `));
        }
        started.response = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newResponse, Colors.teal)));
      this.#lastResponseLength.set(nodeId, response.length);
    }
    
    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n`));
    }
  }

  #printStreamSummary(streamInfo: StreamState): void {
    const parts: string[] = [];
    if (streamInfo.thinking) {
      parts.push(`${color('thinking', Colors.gray)} ${color(String(streamInfo.thinking.length), Colors.silver)}`);
    }
    parts.push(`${color('response', Colors.teal)} ${color(String(streamInfo.response.length), Colors.silver)}`);
    console.log(`  ${color(Colors.dot, Colors.silver)} ${color('stream:', Colors.dim)} ${parts.join(color('  ', Colors.dim))} ${color('chars', Colors.dim)}`);
  }
}
