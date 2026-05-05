import type { Edge, EdgeMetadata } from '../types/index.ts';

export class EdgeImpl implements Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  metadata?: EdgeMetadata;

  constructor(config: { id?: string; sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string; metadata?: EdgeMetadata }) {
    this.id = config.id || crypto.randomUUID();
    this.sourceNodeId = config.sourceNodeId;
    this.sourcePortId = config.sourcePortId;
    this.targetNodeId = config.targetNodeId;
    this.targetPortId = config.targetPortId;
    this.metadata = config.metadata;
  }
}
