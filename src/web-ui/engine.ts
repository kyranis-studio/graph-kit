import type {
  Graph,
  GraphState,
  ExecutionContext,
  WorkflowConfig,
} from "../types/index.ts";
import { topologicalSort } from "../algorithms/sorting.ts";
import type { GraphImpl } from "../core/graph.ts";

export interface WebUIConfig {
  port?: number;
  debugMode?: boolean;
}

interface NodeDef {
  id: string;
  type: string;
  label?: string;
  isStartNode?: boolean;
  isEndNode?: boolean;
  data?: Record<string, unknown>;
  inputs: Array<{ id: string; name: string; type: string; required?: boolean }>;
  outputs: Array<{ id: string; name: string; type: string }>;
}

interface EdgeDef {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

interface GroupDef {
  id: string;
  label: string;
  nodeIds: string[];
}

interface WorkflowDef {
  startNode: string;
  endNode: string;
  conditionalEdges: Array<{
    sourceNodeId: string;
    conditionLabel?: string;
  }>;
}

const PUBLIC_DIR = new URL("./public/", import.meta.url);
const STATIC_MIMES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  json: "application/json",
};

export class WebUIExecutionEngine {
  private port: number;
  private debugMode: boolean;
  private cancelled = false;
  private stepResolve: (() => void) | null = null;
  private sseWriters: Set<WritableStreamDefaultWriter<Uint8Array>> = new Set();
  private resolveExecution!: (state: GraphState) => void;
  private executionPromise!: Promise<GraphState>;
  private controller: AbortController | null = null;
  private nodeInputOverrides: Map<string, Record<string, unknown>> = new Map();

  constructor(config?: WebUIConfig) {
    this.port = config?.port ?? 3000;
    this.debugMode = config?.debugMode ?? false;
  }

  private broadcast(event: string, data: unknown): void {
    const encoder = new TextEncoder();
    const msg = encoder.encode(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    );
    for (const writer of this.sseWriters) {
      writer.write(msg).catch(() => this.sseWriters.delete(writer));
    }
  }

  private buildGraphDef(
    graph: Graph,
  ): {
    nodes: NodeDef[];
    edges: EdgeDef[];
    groups?: GroupDef[];
    workflow?: WorkflowDef;
    metadata?: Record<string, unknown>;
  } {
    const nodes: NodeDef[] = [];
    const edges: EdgeDef[] = [];
    const wc = graph.workflowConfig;
    const allNodeIds = Array.from(graph.nodes.keys());

    for (const node of graph.nodes.values()) {
      nodes.push({
        id: node.id,
        type: node.type,
        label: node.metadata?.label,
        isStartNode: wc?.startNode === node.id,
        isEndNode: wc?.endNode === node.id,
        data: node.data,
        inputs: Array.from(node.inputs.values()).map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          required: p.required,
        })),
        outputs: Array.from(node.outputs.values()).map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
        })),
      });
    }
    for (const edge of graph.edges.values()) {
      edges.push({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        sourcePortId: edge.sourcePortId,
        targetNodeId: edge.targetNodeId,
        targetPortId: edge.targetPortId,
      });
    }

    const result: {
      nodes: NodeDef[];
      edges: EdgeDef[];
      groups?: GroupDef[];
      workflow?: WorkflowDef;
      metadata?: Record<string, unknown>;
    } = {
      nodes,
      edges,
      metadata: (graph as unknown as Record<string, unknown>).metadata as Record<string, unknown> | undefined,
    };

    if (wc) {
      result.workflow = {
        startNode: wc.startNode,
        endNode: wc.endNode,
        conditionalEdges: wc.conditionalEdges,
      };
      result.groups = [
        {
          id: "workflow",
          label: graph.metadata?.name
            ? `Workflow: ${graph.metadata.name}`
            : "Workflow",
          nodeIds: allNodeIds,
        },
      ];
    }

    return result;
  }

  async execute(graph: Graph, initialState?: GraphState): Promise<GraphState> {
    this.cancelled = false;
    this.sseWriters.clear();
    this.executionPromise = new Promise((resolve) => {
      this.resolveExecution = resolve;
    });

    const graphDef = this.buildGraphDef(graph);
    this.controller = new AbortController();

    const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const path = url.pathname;

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      try {
        if (req.method === "GET" && path === "/api/graph") {
          return Response.json({
            graph: graphDef,
            debugMode: this.debugMode,
          });
        }

        if (req.method === "POST" && path === "/api/execute") {
          this.runExecution(graph, initialState).catch((err) => {
            this.broadcast("executionError", { error: String(err) });
          });
          return Response.json({ status: "started" });
        }

        if (req.method === "POST" && path === "/api/step") {
          this.stepResolve?.();
          this.stepResolve = null;
          return Response.json({ status: "continued" });
        }

        if (req.method === "POST" && path === "/api/cancel") {
          this.cancelled = true;
          this.stepResolve?.();
          this.stepResolve = null;
          return Response.json({ status: "cancelled" });
        }

        if (req.method === "POST" && path === "/api/toggle-debug") {
          this.debugMode = !this.debugMode;
          return Response.json({ debugMode: this.debugMode });
        }

        if (req.method === "PUT" && path === "/api/node-inputs") {
          const body = await req.json() as {
            nodeId: string;
            inputs: Record<string, unknown>;
          };
          if (body.nodeId && body.inputs) {
            this.nodeInputOverrides.set(body.nodeId, body.inputs);
            return Response.json({ status: "ok" });
          }
          return Response.json({ status: "error", error: "missing nodeId or inputs" }, { status: 400 });
        }

        if (req.method === "GET" && path === "/api/node-inputs") {
          const overrides: Record<string, Record<string, unknown>> = {};
          for (const [nodeId, inputs] of this.nodeInputOverrides) {
            overrides[nodeId] = inputs;
          }
          return Response.json(overrides);
        }

        if (path === "/api/events") {
          const { readable, writable } = new TransformStream<
            Uint8Array,
            Uint8Array
          >();
          const writer = writable.getWriter();
          this.sseWriters.add(writer);

          req.signal.addEventListener("abort", () => {
            this.sseWriters.delete(writer);
            writer.close().catch(() => {});
          });

          return new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          });
        }

        return await this.serveStatic(path);
      } catch {
        return new Response("Internal Server Error", { status: 500 });
      }
    };

    Deno.serve(
      { port: this.port, signal: this.controller.signal, onListen: () => {
        console.log(
          `\n  Web UI: http://localhost:${this.port}`,
        );
        if (this.debugMode) {
          console.log(
            `  Mode: DEBUG (step-by-step with split-panel UI)`,
          );
        } else {
          console.log(
            `  Mode: AUTO`,
          );
        }
        console.log();
      } },
      handler,
    );

    const state = await this.executionPromise;
    return state;
  }

  close(): void {
    this.controller?.abort();
    this.cancelled = true;
    this.stepResolve?.();
    this.stepResolve = null;
  }

  private async serveStatic(path: string): Promise<Response> {
    const filePath = path === "/" || path === "" ? "/index.html" : path;
    try {
      const url = new URL(`.${filePath}`, PUBLIC_DIR);
      const file = await Deno.readFile(url);
      const ext = filePath.split(".").pop() || "";
      const contentType = STATIC_MIMES[ext] || "application/octet-stream";
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  private async runExecution(
    graph: Graph,
    initialState?: GraphState,
  ): Promise<void> {
    const wc = graph.workflowConfig;

    if (wc) {
      await this.runWorkflowExecution(graph, wc, initialState);
    } else {
      await this.runLinearExecution(graph, initialState);
    }
  }

  private async runWorkflowExecution(
    graph: Graph,
    wc: WorkflowConfig,
    initialState?: GraphState,
  ): Promise<void> {
    const state: GraphState = initialState || {
      values: new Map(),
      messages: [],
    };
    const allNodeIds = Array.from(graph.nodes.keys());
    let currentNodeId = wc.startNode;
    let stepCount = 0;
    const maxSteps = wc.maxSteps ?? 100;
    const condFns = (graph as GraphImpl).workflowConditionFunctions;

    this.broadcast("executionStart", {
      totalNodes: allNodeIds.length,
      nodeOrder: allNodeIds,
      workflowStartNode: wc.startNode,
      workflowEndNode: wc.endNode,
    });

    const executedNodes = new Set<string>();

    while (currentNodeId !== wc.endNode) {
      if (this.cancelled) break;

      stepCount++;
      if (stepCount > maxSteps) {
        throw new Error(
          `Max steps (${maxSteps}) exceeded at ${currentNodeId}. Check for infinite loops.`,
        );
      }

      const node = graph.getNode(currentNodeId);
      if (!node) throw new Error(`Node ${currentNodeId} not found`);

      executedNodes.add(currentNodeId);

      const inputs: Record<string, unknown> = {};
      const incomingEdges = graph
        .getEdgesForNode(currentNodeId)
        .filter((e) => e.targetNodeId === currentNodeId);
      for (const edge of incomingEdges) {
        inputs[edge.targetPortId] = state.values.get(
          `${edge.sourceNodeId}.${edge.sourcePortId}`,
        );
      }
      Object.assign(inputs, node.data);
      this.mergeNodeOverrides(currentNodeId, inputs);

      this.broadcast("nodeStart", {
        nodeId: currentNodeId,
        nodeType: node.type,
        label: node.metadata?.label,
        inputs: this.serializeValue(inputs),
        index: stepCount,
        total: maxSteps,
        predecessors: graph.getPredecessors(currentNodeId).map((n) => n.id),
        successors: graph.getSuccessors(currentNodeId).map((n) => n.id),
        isConditionalSource: wc.conditionalEdges.some(
          (e) => e.sourceNodeId === currentNodeId,
        ),
      });

      if (this.debugMode) {
        this.broadcast("executionPaused", { nodeId: currentNodeId });
        await new Promise<void>((resolve) => {
          this.stepResolve = resolve;
        });
        if (this.cancelled) {
          this.broadcast("nodeSkipped", { nodeId: currentNodeId });
          break;
        }
        this.broadcast("executionResumed", { nodeId: currentNodeId });
      }

      const startTime = performance.now();

      try {
        const offStream = this.attachStreamHandler(graph, currentNodeId);

        const context: ExecutionContext = {
          graph,
          nodeId: currentNodeId,
          state,
          config: node.data,
        };
        const middlewares = (graph as any).getMiddlewares?.() || [];
        await this.runWithMiddlewares(
          middlewares,
          context,
          node,
          inputs,
          state,
        );

        offStream();

        const duration = performance.now() - startTime;
        const outputs: Record<string, unknown> = {};
        for (const [key, value] of state.values.entries()) {
          if (key.startsWith(`${currentNodeId}.`)) {
            outputs[key.split(".")[1]] = value;
          }
        }

        this.broadcast("nodeComplete", {
          nodeId: currentNodeId,
          duration,
          outputs: this.serializeValue(outputs),
        });
      } catch (error) {
        this.broadcast("nodeError", {
          nodeId: currentNodeId,
          error: String(error),
        });
        throw error;
      }

      // Determine next node: check conditional edges, then regular edges
      const condFn = condFns?.get(currentNodeId);
      if (condFn) {
        const nextNodeId = condFn(state);
        this.broadcast("workflowConditionEval", {
          sourceNodeId: currentNodeId,
          targetNodeId: nextNodeId,
        });
        currentNodeId = nextNodeId;
      } else {
        const outgoing = graph
          .getEdgesForNode(currentNodeId)
          .filter((e) => e.sourceNodeId === currentNodeId);
        if (!outgoing.length) {
          throw new Error(`No outgoing edges from ${currentNodeId}`);
        }
        currentNodeId = outgoing[0].targetNodeId;
      }
    }

    this.broadcast("graphComplete", {
      success: !this.cancelled,
      summary: this.cancelled
        ? "Execution cancelled"
        : "Workflow completed successfully",
      totalNodes: executedNodes.size,
      steps: stepCount,
    });

    this.resolveExecution(state);
  }

  private async runLinearExecution(
    graph: Graph,
    initialState?: GraphState,
  ): Promise<void> {
    const state: GraphState = initialState || {
      values: new Map(),
      messages: [],
    };
    const sortedNodes = topologicalSort(graph);

    this.broadcast("executionStart", {
      totalNodes: sortedNodes.length,
      nodeOrder: sortedNodes,
    });

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
      this.mergeNodeOverrides(nodeId, inputs);

      this.broadcast("nodeStart", {
        nodeId,
        nodeType: node.type,
        label: node.metadata?.label,
        inputs: this.serializeValue(inputs),
        index: i + 1,
        total: sortedNodes.length,
        predecessors: graph.getPredecessors(nodeId).map((n) => n.id),
        successors: graph.getSuccessors(nodeId).map((n) => n.id),
      });

      if (this.debugMode) {
        this.broadcast("executionPaused", { nodeId });
        await new Promise<void>((resolve) => {
          this.stepResolve = resolve;
        });
        if (this.cancelled) {
          this.broadcast("nodeSkipped", { nodeId });
          continue;
        }
        this.broadcast("executionResumed", { nodeId });
      }

      const startTime = performance.now();

      try {
        const offStream = this.attachStreamHandler(graph, nodeId);

        const context: ExecutionContext = {
          graph,
          nodeId,
          state,
          config: node.data,
        };
        const middlewares = (graph as any).getMiddlewares?.() || [];
        await this.runWithMiddlewares(
          middlewares,
          context,
          node,
          inputs,
          state,
        );

        offStream();

        const duration = performance.now() - startTime;
        const outputs: Record<string, unknown> = {};
        for (const [key, value] of state.values.entries()) {
          if (key.startsWith(`${nodeId}.`)) {
            outputs[key.split(".")[1]] = value;
          }
        }

        this.broadcast("nodeComplete", {
          nodeId,
          duration,
          outputs: this.serializeValue(outputs),
        });
      } catch (error) {
        this.broadcast("nodeError", {
          nodeId,
          error: String(error),
        });
        throw error;
      }
    }

    this.broadcast("graphComplete", {
      success: !this.cancelled,
      summary: this.cancelled
        ? "Execution cancelled"
        : "Graph completed successfully",
      totalNodes: sortedNodes.length,
    });

    this.resolveExecution(state);
  }

  private attachStreamHandler(graph: Graph, nodeId: string): () => void {
    const handler = (data: unknown) => {
      const chunk = data as {
        nodeId: string;
        state: { response: string; thinking?: string; done: boolean };
      };
      this.broadcast("streamChunk", chunk);
    };
    graph.on("llmStreamChunk", handler);
    return () => graph.off("llmStreamChunk", handler);
  }

  private mergeNodeOverrides(nodeId: string, inputs: Record<string, unknown>): void {
    const overrides = this.nodeInputOverrides.get(nodeId);
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined && value !== "") {
          inputs[key] = value;
        }
      }
    }
  }

  private serializeValue(
    obj: Record<string, unknown>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      try {
        result[key] = typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2);
      } catch {
        result[key] = String(value);
      }
    }
    return result;
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
}
