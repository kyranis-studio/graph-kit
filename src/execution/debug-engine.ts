import type {
  Graph,
  GraphState,
  ExecutionContext,
  LogLevel,
} from "../types/index.ts";
import { topologicalSort } from "../algorithms/sorting.ts";
import { Colors, color } from "../utils/colors.ts";
import { ExecutionLogger } from "./log-engine.ts";

export interface NodeDebugInfo {
  nodeId: string;
  nodeType: string;
  label?: string;
  inputs: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration?: number;
  status: "pending" | "running" | "completed" | "error";
  error?: unknown;
  predecessors: string[];
  successors: string[];
}

export interface DebugStreamState {
  nodeId: string;
  state: {
    response: string;
    thinking?: string;
    done: boolean;
  };
}

export class DebugExecutionEngine {
  private cancelled = false;
  private stepMode: boolean;
  private forceFullLog: boolean;
  private forceStreaming: boolean;
  private executionLogData: NodeDebugInfo[] = [];
  private logger: ExecutionLogger;

  private onNodeStart?: (info: NodeDebugInfo) => void;
  private onNodeComplete?: (info: NodeDebugInfo) => void;
  private onNodeError?: (info: NodeDebugInfo) => void;
  private onStreamChunk?: (state: DebugStreamState) => void;

  constructor(config?: {
    stepMode?: boolean;
    forceFullLog?: boolean;
    forceStreaming?: boolean;
    logLevel?: LogLevel;
    onNodeStart?: (info: NodeDebugInfo) => void;
    onNodeComplete?: (info: NodeDebugInfo) => void;
    onNodeError?: (info: NodeDebugInfo) => void;
    onStreamChunk?: (state: DebugStreamState) => void;
  }) {
    this.stepMode = config?.stepMode ?? false;
    this.forceFullLog = config?.forceFullLog ?? false;
    this.forceStreaming = config?.forceStreaming ?? false;
    this.onNodeStart = config?.onNodeStart;
    this.onNodeComplete = config?.onNodeComplete;
    this.onNodeError = config?.onNodeError;
    this.onStreamChunk = config?.onStreamChunk;

    const level: LogLevel =
      config?.logLevel || (this.forceFullLog ? "verbose" : "minimal");
    this.logger = new ExecutionLogger({ logLevel: level });
  }

  get executionLog(): ReadonlyArray<NodeDebugInfo> {
    return this.executionLogData;
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  cancel(): void {
    this.cancelled = true;
  }

  reset(): void {
    this.cancelled = false;
    this.executionLogData = [];
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    this.reset();
    const state: GraphState = initialState || {
      values: new Map(),
      messages: [],
    };
    const sortedNodes = topologicalSort(graph);

    const offStream = this.attachStreamHandler(graph);

    this.logger.printHeader("DEBUG MODE", sortedNodes.length, {
      Mode: this.stepMode ? "STEP (SPACE=run, ESC=cancel)" : "AUTO",
      First: sortedNodes[0] || "none",
      Last: sortedNodes[sortedNodes.length - 1] || "none",
    });

    if (
      this.stepMode &&
      this.logger.logLevel !== "silent" &&
      this.logger.logLevel !== "muted"
    ) {
      this.logger.info(
        `Press ${color("[SPACE]", Colors.warning)} to execute or ${color("[ESC]", Colors.error)} to cancel`,
      );
      console.log();
    }

    for (let i = 0; i < sortedNodes.length; i++) {
      if (this.cancelled) break;

      const nodeId = sortedNodes[i];
      const node = graph.getNode(nodeId)!;

      const inputs: Record<string, unknown> = {};
      const incomingEdges = graph
        .getEdgesForNode(nodeId)
        .filter((e) => e.targetNodeId === nodeId);
      for (const edge of incomingEdges) {
        inputs[edge.targetPortId] = state.values.get(
          `${edge.sourceNodeId}.${edge.sourcePortId}`,
        );
      }
      Object.assign(inputs, node.data);

      if (this.forceStreaming && node.data) {
        (node.data as Record<string, unknown>).streaming = true;
      }

      const info: NodeDebugInfo = {
        nodeId,
        nodeType: node.type,
        label: node.metadata?.label,
        inputs,
        status: "pending",
        predecessors: graph.getPredecessors(nodeId).map((n) => n.id),
        successors: graph.getSuccessors(nodeId).map((n) => n.id),
      };

      this.logger.printNodeStart(
        nodeId,
        node.type,
        i + 1,
        sortedNodes.length,
        info.label,
      );

      if (info.predecessors.length > 0 && this.logger.logLevel === "verbose") {
        this.logger.printDebug("in", info.predecessors.join(", "));
      }

      this.logger.printNodeInputs(inputs);

      if (this.stepMode) {
        await this.waitForStep();
        if (this.cancelled) {
          this.logger.warn("execution cancelled", nodeId);
          continue;
        }
      }

      info.status = "running";
      this.executionLogData.push(info);
      this.onNodeStart?.(info);
      graph.emit("nodeStart", { nodeId, inputs });
      const startTime = performance.now();

      try {
        const context: ExecutionContext = {
          graph,
          nodeId,
          state,
          config: node.data,
          logger: this.logger,
        };
        const middlewares = (graph as any).getMiddlewares?.() || [];
        await this.runWithMiddlewares(
          middlewares,
          context,
          node,
          inputs,
          state,
        );

        info.status = "completed";
        info.duration = performance.now() - startTime;

        // Collect outputs
        const outputs: Record<string, unknown> = {};
        for (const [key, value] of state.values.entries()) {
          if (key.startsWith(`${nodeId}.`)) {
            outputs[key.split(".")[1]] = value;
          }
        }
        info.output = outputs;

        this.logger.printStreamSummary(nodeId);
        this.logger.printNodeOutputs(outputs);
        this.logger.printNodeDone(info.duration);
        graph.emit("nodeComplete", { nodeId, output: info.output, inputs });
        this.onNodeComplete?.(info);
      } catch (error) {
        info.status = "error";
        info.error = error;
        info.duration = performance.now() - startTime;

        graph.emit("nodeError", { nodeId, error });
        this.onNodeError?.(info);
        this.logger.printNodeError(error);
        offStream();
        throw error;
      }
    }

    offStream();
    const completed = this.executionLogData.filter(
      (n) => n.status === "completed",
    ).length;
    const errors = this.executionLogData.filter(
      (n) => n.status === "error",
    ).length;

    this.logger.printFooter(errors > 0 ? "failed" : "success", [
      `${completed}/${sortedNodes.length} nodes completed`,
      errors > 0 ? `${errors} errors` : "no errors",
    ]);
    graph.emit("graphComplete", { state });
    return state;
  }

  private attachStreamHandler(graph: Graph): () => void {
    const handler = (data: unknown) => {
      const chunk = data as DebugStreamState;
      this.onStreamChunk?.(chunk);

      const node = graph.getNode(chunk.nodeId);
      const streaming = node?.data?.streaming === true || this.forceStreaming;

      this.logger.handleStreamChunk({
        ...chunk,
        streaming,
      });
    };
    graph.on("llmStreamChunk", handler);
    return () => graph.off("llmStreamChunk", handler);
  }

  private runWithMiddlewares(
    middlewares: Array<
      (context: ExecutionContext, next: () => Promise<void>) => Promise<void>
    >,
    context: ExecutionContext,
    node: { execute: (inputs: unknown, ctx: ExecutionContext) => unknown },
    inputs: Record<string, unknown>,
    state: GraphState,
  ): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      let middlewareIndex = 0;

      const run = async () => {
        if (middlewareIndex < middlewares.length) {
          const mw = middlewares[middlewareIndex++];
          await mw(context, run);
        } else {
          try {
            const output = (await node.execute(inputs, context)) as Record<
              string,
              unknown
            >;
            for (const [portId, value] of Object.entries(output)) {
              state.values.set(`${context.nodeId}.${portId}`, value);
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      };

      await run();
    });
  }

  private async waitForStep(): Promise<void> {
    return new Promise<void>((resolve) => {
      const buf = new Uint8Array(1);
      Deno.stdin.setRaw(true);

      const readKey = async () => {
        try {
          const n = await Deno.stdin.read(buf);
          if (n === null) {
            Deno.stdin.setRaw(false);
            resolve();
            return;
          }
          const key = buf[0];

          if (key === 32) {
            // Space
            Deno.stdin.setRaw(false);
            resolve();
          } else if (key === 27) {
            // Esc
            Deno.stdin.setRaw(false);
            this.cancelled = true;
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
