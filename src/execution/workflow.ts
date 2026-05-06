import type { Workflow, GraphState, Graph, Node } from '../types/index.ts';
import { GraphImpl } from '../core/graph.ts';
import type { LogLevel } from './engine.ts';

const Colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  brightGreen: '\x1b[92m',
  brightCyan: '\x1b[96m',
  bgDarkBlue: '\x1b[44m',
};

function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${Colors.reset}`;
}

interface StreamState {
  response: string;
  thinking?: string;
  done: boolean;
}

export class WorkflowImpl implements Workflow {
  #graph: Graph;
  #startNode: string;
  #endNode: string;
  #onStateUpdate?: (state: GraphState) => void;
  #conditionalEdges: Array<{ sourceNodeId: string; condition: (state: GraphState) => string }> = [];
  #logLevel: LogLevel;
  #streamState: Map<string, StreamState> = new Map();
  #lastThinkingLength: Map<string, number> = new Map();
  #lastResponseLength: Map<string, number> = new Map();
  #streamStarted: Map<string, { thinking: boolean; response: boolean }> = new Map();
  #stepCount = 0;

  constructor(graph: Graph, config: Parameters<Workflow['addNode']>[1] & { startNode: string; endNode: string; onStateUpdate?: (state: GraphState) => void; verbose?: boolean; logLevel?: LogLevel }) {
    this.#graph = graph;
    this.#startNode = config.startNode;
    this.#endNode = config.endNode;
    this.#onStateUpdate = config.onStateUpdate;
    
    if (config.logLevel) {
      this.#logLevel = config.logLevel;
    } else if (config.verbose === true) {
      this.#logLevel = 'verbose';
    } else if (config.verbose === false) {
      this.#logLevel = 'silent';
    } else {
      this.#logLevel = 'minimal';
    }
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
    this.#stepCount = 0;

    if (this.#logLevel !== 'silent') {
      console.log(`\n${color(' WORKFLOW EXECUTION ', Colors.bgDarkBlue + Colors.reset)}`);
      if (this.#logLevel === 'verbose') {
        console.log(color('─'.repeat(50), Colors.dim));
        console.log(`Start: ${color(this.#startNode, Colors.green)} → End: ${color(this.#endNode, Colors.yellow)}`);
        console.log(color('─'.repeat(50), Colors.dim) + '\n');
      }
    }

    this.#graph.on('llmStreamChunk', (data: unknown) => {
      const chunk = data as { nodeId: string; state: StreamState };
      this.#streamState.set(chunk.nodeId, chunk.state);
      if (this.#logLevel === 'verbose') {
        this.#printStreamChunk(chunk);
      }
    });

    while (currentNodeId !== this.#endNode) {
      if (visited.has(currentNodeId)) throw new Error(`Cycle detected at ${currentNodeId}`);
      visited.add(currentNodeId);
      this.#stepCount++;

      const node = this.#graph.getNode(currentNodeId);
      if (!node) throw new Error(`Node ${currentNodeId} not found`);

      if (this.#logLevel !== 'silent') {
        if (this.#logLevel === 'verbose') {
          console.log(`${color('●', Colors.cyan)} ${color(`[step ${this.#stepCount}]`, Colors.dim)} ${color(currentNodeId, Colors.brightCyan)} ${color(`(${node.type})`, Colors.dim)}`);
        } else {
          console.log(`${color('●', Colors.cyan)} [step ${this.#stepCount}] ${currentNodeId} (${node.type})`);
        }
      }

      const inputs: Record<string, unknown> = {};
      const incomingEdges = this.#graph.getEdgesForNode(currentNodeId).filter(e => e.targetNodeId === currentNodeId);
      for (const edge of incomingEdges) {
        const sourceOutputKey = `${edge.sourceNodeId}.${edge.sourcePortId}`;
        inputs[edge.targetPortId] = state.values.get(sourceOutputKey);
      }

      Object.assign(inputs, node.data);

      if (this.#logLevel === 'verbose' && Object.keys(inputs).length > 0) {
        const inputPreview = Object.entries(inputs)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v.toString().slice(0, 20)}${v.toString().length > 20 ? '...' : ''}"` : v}`)
          .join(', ');
        console.log(`  ${color('inputs:', Colors.dim)} ${inputPreview}`);
      }

      const output = await node.execute(inputs, { graph: this.#graph, nodeId: currentNodeId, state });
      
      for (const [portId, value] of Object.entries(output as Record<string, unknown>)) {
        state.values.set(`${currentNodeId}.${portId}`, value);
      }

      if (this.#logLevel !== 'silent') {
        if (this.#logLevel === 'verbose') {
          const streamInfo = this.#streamState.get(currentNodeId);
          if (streamInfo) {
            this.#printStreamSummary(streamInfo);
          }
          console.log(`  ${color('✓ complete', Colors.brightGreen)}`);
        } else {
          console.log(`  ${color('✓ complete', Colors.brightGreen)}`);
        }
      }

      this.#onStateUpdate?.(state);

      const conditional = this.#conditionalEdges.find(e => e.sourceNodeId === currentNodeId);
      if (conditional) {
        const nextNodeId = conditional.condition(state);
        if (this.#logLevel === 'verbose') {
          console.log(`  ${color('→ condition →', Colors.dim)} ${color(nextNodeId, Colors.yellow)}\n`);
        } else if (this.#logLevel === 'minimal') {
          console.log(`  → ${nextNodeId}`);
        }
        currentNodeId = nextNodeId;
      } else {
        const outgoing = this.#graph.getEdgesForNode(currentNodeId).filter(e => e.sourceNodeId === currentNodeId);
        if (!outgoing.length) throw new Error(`No outgoing edges from ${currentNodeId}`);
        if (this.#logLevel === 'verbose') {
          const nextNodeId = outgoing[0].targetNodeId;
          console.log(`  ${color('→ next →', Colors.dim)} ${color(nextNodeId, Colors.blue)}\n`);
        } else if (this.#logLevel === 'minimal') {
          console.log(`  → ${outgoing[0].targetNodeId}`);
        }
        currentNodeId = outgoing[0].targetNodeId;
      }
    }

    if (this.#logLevel !== 'silent') {
      console.log(color('─'.repeat(50), Colors.dim));
      console.log(`${color('✓ WORKFLOW COMPLETE', Colors.bgDarkBlue + Colors.reset)} ${color(`(${this.#stepCount} steps)`, Colors.dim)}\n`);
    }

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
    
    const newThinking = thinking ? thinking.slice(prevThinkingLen) : '';
    const newResponse = response.slice(prevResponseLen);
    
    if (thinking && newThinking.length > 0) {
      if (!started.thinking) {
        Deno.stdout.writeSync(new TextEncoder().encode(`  ${color('▸ thinking:', Colors.magenta + Colors.dim)} `));
        started.thinking = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newThinking, Colors.magenta)));
      this.#lastThinkingLength.set(nodeId, thinking.length);
    }
    
    if (newResponse.length > 0) {
      if (!started.response) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('▸ response:', Colors.brightGreen + Colors.dim)} `));
        started.response = true;
      }
      Deno.stdout.writeSync(new TextEncoder().encode(color(newResponse, Colors.brightGreen)));
      this.#lastResponseLength.set(nodeId, response.length);
    }
    
    if (done) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\n  ${color('━ stream complete ━', Colors.dim)}\n`));
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
