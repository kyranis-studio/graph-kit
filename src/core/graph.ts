import { NodeImpl } from './node.ts';
import { EdgeImpl } from './edge.ts';
import type { Graph, GraphMetadata, GraphState, NodeTypeDefinition, Workflow, Edge as EdgeType, ExecutionContext, NodeMetadata } from '../types/index.ts';
import { topologicalSort } from '../algorithms/sorting.ts';
import { validateGraph } from '../algorithms/validation.ts';
import { ExecutionEngine, type LogLevel } from '../execution/engine.ts';
import { WorkflowImpl } from '../execution/workflow.ts';
import { toMermaid, toDOT } from '../utils/export.ts';

export class GraphImpl implements Graph {
  id: string;
  nodes: Map<string, NodeImpl>;
  edges: Map<string, EdgeImpl>;
  metadata?: GraphMetadata;
  
  #nodeTypes = new Map<string, NodeTypeDefinition>();
  #eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  #middlewares: Array<(context: ExecutionContext, next: () => Promise<void>) => Promise<void>> = [];
  #executionEngine = new ExecutionEngine();

  constructor(config?: { id?: string; metadata?: GraphMetadata }) {
    this.id = config?.id || crypto.randomUUID();
    this.nodes = new Map();
    this.edges = new Map();
    this.metadata = config?.metadata;
  }

  registerNodeType(type: string, definition: NodeTypeDefinition): void {
    this.#nodeTypes.set(type, definition);
  }

  addNode(type: string, config?: { id?: string; data?: Record<string, unknown>; metadata?: NodeMetadata }): NodeImpl {
    const typeDef = this.#nodeTypes.get(type);
    if (!typeDef) throw new Error(`Node type "${type}" not registered`);
    
    const node = new NodeImpl({
      id: config?.id,
      type,
      inputs: typeDef.inputs,
      outputs: typeDef.outputs,
      data: config?.data,
      metadata: config?.metadata || typeDef.metadata,
      execute: typeDef.execute,
    });
    
    this.nodes.set(node.id, node);
    this.emit('nodeAdded', { nodeId: node.id });
    return node;
  }

  removeNode(nodeId: string): void {
    const edgesToRemove = this.getEdgesForNode(nodeId).map(e => e.id);
    edgesToRemove.forEach(id => this.removeEdge(id));
    this.nodes.delete(nodeId);
    this.emit('nodeRemoved', { nodeId });
  }

  updateNodeData(nodeId: string, data: Record<string, unknown>): void {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    Object.assign(node.data, data);
    this.emit('nodeDataUpdated', { nodeId, data });
  }

  addEdge(edgeConfig: Omit<EdgeType, 'id'> & { id?: string }): EdgeImpl {
    const sourceNode = this.nodes.get(edgeConfig.sourceNodeId);
    const targetNode = this.nodes.get(edgeConfig.targetNodeId);
    if (!sourceNode) throw new Error(`Source node ${edgeConfig.sourceNodeId} not found`);
    if (!targetNode) throw new Error(`Target node ${edgeConfig.targetNodeId} not found`);
    
    if (!sourceNode.outputs.has(edgeConfig.sourcePortId)) {
      throw new Error(`Source port ${edgeConfig.sourcePortId} not found on node ${edgeConfig.sourceNodeId}`);
    }
    if (!targetNode.inputs.has(edgeConfig.targetPortId)) {
      throw new Error(`Target port ${edgeConfig.targetPortId} not found on node ${edgeConfig.targetNodeId}`);
    }

    const edge = new EdgeImpl(edgeConfig);
    this.edges.set(edge.id, edge);
    this.emit('edgeAdded', { edgeId: edge.id });
    return edge;
  }

  removeEdge(edgeId: string): void {
    this.edges.delete(edgeId);
    this.emit('edgeRemoved', { edgeId });
  }

  getNode(nodeId: string): NodeImpl | undefined {
    return this.nodes.get(nodeId);
  }

  getEdgesForNode(nodeId: string): EdgeImpl[] {
    return Array.from(this.edges.values()).filter(e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId);
  }

  getPredecessors(nodeId: string): NodeImpl[] {
    const edges = this.getEdgesForNode(nodeId).filter(e => e.targetNodeId === nodeId);
    return edges.map(e => this.nodes.get(e.sourceNodeId)!).filter(Boolean);
  }

  getSuccessors(nodeId: string): NodeImpl[] {
    const edges = this.getEdgesForNode(nodeId).filter(e => e.sourceNodeId === nodeId);
    return edges.map(e => this.nodes.get(e.targetNodeId)!).filter(Boolean);
  }

  validate(): string[] {
    return validateGraph(this);
  }

  toJSON(): string {
    const graphObj = {
      id: this.id,
      nodes: Array.from(this.nodes.values()).map(n => ({
        id: n.id,
        type: n.type,
        inputs: Array.from(n.inputs.values()),
        outputs: Array.from(n.outputs.values()),
        data: n.data,
        metadata: n.metadata,
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        sourcePortId: e.sourcePortId,
        targetNodeId: e.targetNodeId,
        targetPortId: e.targetPortId,
        metadata: e.metadata,
      })),
      metadata: this.metadata,
    };
    return JSON.stringify(graphObj);
  }

  toMermaid(): string {
    return toMermaid(this);
  }

  toDOT(): string {
    return toDOT(this);
  }

  async execute(initialState?: GraphState, options?: { silent?: boolean; logLevel?: LogLevel }): Promise<GraphState> {
    if (options?.logLevel) {
      const engine = new ExecutionEngine({ logLevel: options.logLevel });
      return engine.execute(this, initialState);
    }
    if (options?.silent) {
      const silentEngine = new ExecutionEngine({ logLevel: 'silent' });
      return silentEngine.execute(this, initialState);
    }
    return this.#executionEngine.execute(this, initialState);
  }

  createWorkflow(config: Parameters<Graph['createWorkflow']>[0]): Workflow {
    return new WorkflowImpl(this, config);
  }

  use(middleware: Parameters<Graph['use']>[0]): void {
    this.#middlewares.push(middleware);
  }

  getMiddlewares() {
    return this.#middlewares;
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.#eventHandlers.has(event)) this.#eventHandlers.set(event, []);
    this.#eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.#eventHandlers.get(event);
    if (handlers) this.#eventHandlers.set(event, handlers.filter(h => h !== handler));
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.#eventHandlers.get(event);
    handlers?.forEach(handler => handler(...args));
  }
}
