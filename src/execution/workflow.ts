import type { Workflow, GraphState, Graph, Node } from '../types/index.ts';
import { GraphImpl } from '../core/graph.ts';
import type { LogLevel } from './engine.ts';
import { Colors, color } from '../utils/colors.ts';

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
      console.log(`\n${color(Colors.line.repeat(50), Colors.gray)}`);
      console.log(`${color(' GRAPHKIT ', Colors.bold + Colors.bgGray + Colors.white)} ${bold(color('WORKFLOW', Colors.sky))}`);
      if (this.#logLevel === 'verbose') {
        console.log(color(Colors.line.repeat(50), Colors.dim));
        console.log(`  ${color(Colors.dot, Colors.gray)} ${color('Start:', Colors.dim)} ${color(this.#startNode, Colors.teal)} ${color('→', Colors.dim)} ${color('End:', Colors.dim)} ${color(this.#endNode, Colors.gold)}`);
        console.log(color(Colors.line.repeat(50), Colors.dim) + '\n');
      } else {
        console.log(color(Colors.line.repeat(50), Colors.dim) + '\n');
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
        const progress = color(`[step ${this.#stepCount}]`, Colors.dim);
        const nodeIdText = bold(color(currentNodeId, Colors.sky));
        const typeText = color(`(${node.type})`, Colors.gray);
        
        console.log(`${color(Colors.arrow, Colors.sky)} ${progress} ${nodeIdText} ${typeText}`);
      }

      const inputs: Record<string, unknown> = {};
      const incomingEdges = this.#graph.getEdgesForNode(currentNodeId).filter(e => e.targetNodeId === currentNodeId);
      for (const edge of incomingEdges) {
        const sourceOutputKey = `${edge.sourceNodeId}.${edge.sourcePortId}`;
        inputs[edge.targetPortId] = state.values.get(sourceOutputKey);
      }

      Object.assign(inputs, node.data);

      if (this.#logLevel === 'verbose' && Object.keys(inputs).length > 0) {
        for (const [k, v] of Object.entries(inputs)) {
          const preview = typeof v === 'string' ? `"${v.slice(0, 30)}${v.length > 30 ? '...' : ''}"` : String(v);
          console.log(`    ${color(Colors.bullet, Colors.sky)} ${color(k, Colors.gray)} ${color('=', Colors.dim)} ${color(preview, Colors.silver)}`);
        }
      }

      const startTime = performance.now();
      const output = await node.execute(inputs, { graph: this.#graph, nodeId: currentNodeId, state });
      const duration = performance.now() - startTime;
      
      for (const [portId, value] of Object.entries(output as Record<string, unknown>)) {
        state.values.set(`${currentNodeId}.${portId}`, value);
      }

      if (this.#logLevel !== 'silent') {
        const time = color(`${duration.toFixed(1)}ms`, Colors.gold);
        if (this.#logLevel === 'verbose') {
          const streamInfo = this.#streamState.get(currentNodeId);
          if (streamInfo) {
            this.#printStreamSummary(streamInfo);
          }
          console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`);
        } else {
          console.log(`  ${color(Colors.check, Colors.teal)} ${color('done', Colors.teal)} ${color('in', Colors.dim)} ${time}`);
        }
      }

      this.#onStateUpdate?.(state);

      const conditional = this.#conditionalEdges.find(e => e.sourceNodeId === currentNodeId);
      if (conditional) {
        const nextNodeId = conditional.condition(state);
        if (this.#logLevel === 'verbose') {
          console.log(`  ${color('→ condition →', Colors.dim)} ${bold(color(nextNodeId, Colors.gold))}\n`);
        } else if (this.#logLevel === 'minimal') {
          console.log(`  ${color('→', Colors.dim)} ${color(nextNodeId, Colors.gold)}`);
        }
        currentNodeId = nextNodeId;
      } else {
        const outgoing = this.#graph.getEdgesForNode(currentNodeId).filter(e => e.sourceNodeId === currentNodeId);
        if (!outgoing.length) throw new Error(`No outgoing edges from ${currentNodeId}`);
        const nextNodeId = outgoing[0].targetNodeId;
        if (this.#logLevel === 'verbose') {
          console.log(`  ${color('→ next →', Colors.dim)} ${bold(color(nextNodeId, Colors.sky))}\n`);
        } else if (this.#logLevel === 'minimal') {
          console.log(`  ${color('→', Colors.dim)} ${color(nextNodeId, Colors.sky)}`);
        }
        currentNodeId = nextNodeId;
      }
    }

    if (this.#logLevel !== 'silent') {
      console.log(color(Colors.line.repeat(50), Colors.dim));
      console.log(`${color(' WORKFLOW COMPLETE ', Colors.bold + Colors.bgTeal + Colors.white)} ${color(`(${this.#stepCount} steps)`, Colors.dim)}\n`);
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

  #printStreamSummary(streamInfo: StreamState): void {
    const parts: string[] = [];
    if (streamInfo.thinking) {
      parts.push(`${color('thinking', Colors.gray)} ${color(String(streamInfo.thinking.length), Colors.silver)}`);
    }
    parts.push(`${color('response', Colors.teal)} ${color(String(streamInfo.response.length), Colors.silver)}`);
    console.log(`  ${color(Colors.dot, Colors.silver)} ${color('stream:', Colors.dim)} ${parts.join(color('  ', Colors.dim))} ${color('chars', Colors.dim)}`);
  }
}
