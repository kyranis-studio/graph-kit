import type { Graph, GraphState, ExecutionContext } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';

const Colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  bgDarkBlue: '\x1b[44m',
  bgDarkGreen: '\x1b[42m',
};

function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${Colors.reset}`;
}

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
      console.log(`\n${color(' GRAPH EXECUTION ', Colors.bgDarkBlue + Colors.reset)}${color(` ${sortedNodes.length} nodes`, Colors.dim)}`);
      if (this.#logLevel === 'verbose') {
        console.log(color('─'.repeat(50), Colors.dim));
        console.log(`Order: ${sortedNodes.map((id, i) => color(id, i === 0 ? Colors.green : i === sortedNodes.length - 1 ? Colors.brightMagenta : Colors.blue)).join(color(' → ', Colors.dim))}`);
        console.log(color('─'.repeat(50), Colors.dim) + '\n');
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
        const progress = `[${i + 1}/${sortedNodes.length}]`;
        if (this.#logLevel === 'verbose') {
          console.log(`${color('●', Colors.cyan)} ${color(progress, Colors.dim)} ${color(nodeId, Colors.brightCyan)} ${color(`(${node.type})`, Colors.dim)}`);
          
          if (Object.keys(inputs).length > 0) {
            const inputPreview = Object.entries(inputs)
              .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v.toString().slice(0, 30)}${v.toString().length > 30 ? '...' : ''}"` : v}`)
              .join(', ');
            console.log(`  ${color('inputs:', Colors.dim)} ${inputPreview}`);
          }
        } else {
          console.log(`${color('●', Colors.cyan)} ${progress} ${nodeId} (${node.type})`);
        }
      }

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
        
        if (this.#logLevel === 'verbose') {
          const streamInfo = this.#streamState.get(nodeId);
          if (streamInfo) {
            this.#printStreamSummary(streamInfo);
          }
          console.log(`  ${color('✓ complete', Colors.brightGreen)}`);
        } else if (this.#logLevel === 'minimal') {
          console.log(`  ${color('✓ complete', Colors.brightGreen)}`);
        }
        
        graph.emit('nodeComplete', { nodeId, output: inputs, inputs });
      } catch (error) {
        if (this.#logLevel !== 'silent') {
          console.log(`  ${color('✗ failed: ' + error, Colors.red)}`);
        }
        graph.emit('nodeError', { nodeId, error });
        throw error;
      }
    }

    if (this.#logLevel !== 'silent') {
      console.log('\n' + color('─'.repeat(50), Colors.dim));
      console.log(`${color('✓ GRAPH COMPLETE', Colors.bgDarkGreen + Colors.reset)}\n`);
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
          Deno.stdout.writeSync(new TextEncoder().encode(`  ${color('▸ thinking:', Colors.magenta + Colors.dim)} `));
          started.thinking = true;
        }
        Deno.stdout.writeSync(new TextEncoder().encode(color(newThinking, Colors.magenta)));
        this.#lastThinkingLength.set(nodeId, thinking.length);
      }
    }
    
    // Show response in both minimal and verbose modes
    const newResponse = response.slice(prevResponseLen);
    if (newResponse.length > 0) {
      if (!started.response) {
        if (this.#logLevel === 'verbose') {
          Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('▸ response:', Colors.brightGreen + Colors.dim)} `));
        } else {
          // Minimal mode - just show the response directly
          Deno.stdout.writeSync(new TextEncoder().encode(`  `));
        }
        started.response = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newResponse, Colors.brightGreen)));
      this.#lastResponseLength.set(nodeId, response.length);
    }
    
    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n`));
    }
  }

  #printStreamSummary(streamInfo: StreamState): void {
    const parts: string[] = [];
    if (streamInfo.thinking) {
      parts.push(`${color('thinking:', Colors.magenta)} ${streamInfo.thinking.length} chars`);
    }
    parts.push(`${color('response:', Colors.brightGreen)} ${streamInfo.response.length} chars`);
    console.log(`  ${color(parts.join('  '), Colors.dim)}`);
  }
}
