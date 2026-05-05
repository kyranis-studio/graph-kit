// Port types
export type PortType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any' | string;

// Basic interfaces
export interface Port {
  id: string;
  name: string;
  type: PortType;
  required: boolean;
  defaultValue?: unknown;
  schema?: unknown;
}

export interface NodeMetadata {
  label?: string;
  description?: string;
  category?: string;
  color?: string;
  position?: { x: number; y: number };
  [key: string]: unknown;
}

export interface EdgeMetadata {
  label?: string;
  color?: string;
  animated?: boolean;
}

export interface GraphMetadata {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

// State management
export interface GraphState {
  values: Map<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}

export interface Checkpoint {
  graphId: string;
  state: GraphState;
  timestamp: number;
  [key: string]: unknown;
}

export interface StateStore {
  save(checkpoint: Checkpoint): Promise<void>;
  load(graphId: string): Promise<Checkpoint | null>;
  list(graphId: string): Promise<Checkpoint[]>;
}

// Execution
export interface ExecutionContext {
  graph: Graph;
  nodeId: string;
  state: GraphState;
  config?: Record<string, unknown>;
}

export type NodeExecutor<TInput = unknown, TOutput = unknown> = (
  inputs: TInput,
  context: ExecutionContext
) => Promise<TOutput> | TOutput;

// Node type definition for registry
export interface NodeTypeDefinition {
  inputs: Array<Omit<Port, 'id'> & { id?: string }>;
  outputs: Array<Omit<Port, 'id'> & { id?: string }>;
  execute: NodeExecutor;
  metadata?: NodeMetadata;
}

// Core interfaces
export interface Node {
  id: string;
  type: string;
  inputs: Map<string, Port>;
  outputs: Map<string, Port>;
  data: Record<string, unknown>;
  metadata?: NodeMetadata;
  execute: NodeExecutor;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  metadata?: EdgeMetadata;
}

export interface Graph {
  id: string;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  metadata?: GraphMetadata;
  
  // Node type management
  registerNodeType(type: string, definition: NodeTypeDefinition): void;
  
  // Graph operations
  addNode(type: string, config?: { id?: string; data?: Record<string, unknown>; metadata?: NodeMetadata }): Node;
  removeNode(nodeId: string): void;
  updateNodeData(nodeId: string, data: Record<string, unknown>): void;
  
  addEdge(edgeConfig: Omit<Edge, 'id'> & { id?: string }): Edge;
  removeEdge(edgeId: string): void;
  
  getNode(nodeId: string): Node | undefined;
  getEdgesForNode(nodeId: string): Edge[];
  getPredecessors(nodeId: string): Node[];
  getSuccessors(nodeId: string): Node[];
  
  validate(): string[];
  toJSON(): string;
  toMermaid(): string;
  toDOT(): string;
  
  // Execution
  execute(initialState?: GraphState): Promise<GraphState>;
  createWorkflow(config: { startNode: string; endNode: string; onStateUpdate?: (state: GraphState) => void }): Workflow;
  
  // Middleware
  use(middleware: (context: ExecutionContext, next: () => Promise<void>) => Promise<void>): void;
  
  // Events
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

export interface Workflow {
  addNode(type: string, config: { id?: string; data?: Record<string, unknown>; metadata?: NodeMetadata }): Node;
  connect(source: string, target: string): Workflow;
  addConditionalEdge(config: { sourceNodeId: string; condition: (state: GraphState) => string }): void;
  run(initialState?: GraphState): Promise<GraphState>;
}

export interface GraphConfig {
  id?: string;
  metadata?: GraphMetadata;
  name?: string;
}
