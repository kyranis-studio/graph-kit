import { PortImpl } from './port.ts';
import type { Node, NodeExecutor, NodeMetadata, NodeTypeDefinition } from '../types/index.ts';

export class NodeImpl implements Node {
  id: string;
  type: string;
  inputs: Map<string, PortImpl>;
  outputs: Map<string, PortImpl>;
  data: Record<string, unknown>;
  metadata?: NodeMetadata;
  execute: NodeExecutor;

  constructor(config: {
    id?: string;
    type: string;
    inputs: NodeTypeDefinition['inputs'];
    outputs: NodeTypeDefinition['outputs'];
    data?: Record<string, unknown>;
    metadata?: NodeMetadata;
    execute: NodeExecutor;
  }) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.data = config.data || {};
    this.metadata = config.metadata;
    this.execute = config.execute;

    this.inputs = new Map();
    for (const input of config.inputs) {
      const port = input instanceof PortImpl ? input : new PortImpl(input);
      this.inputs.set(port.id, port);
    }

    this.outputs = new Map();
    for (const output of config.outputs) {
      const port = output instanceof PortImpl ? output : new PortImpl(output);
      this.outputs.set(port.id, port);
    }
  }
}
