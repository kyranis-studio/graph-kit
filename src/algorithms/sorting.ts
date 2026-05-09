import type { Graph } from '../types/index.ts';

export function topologicalSort(graph: Pick<Graph, 'edges' | 'nodes'>): string[] {
  const visited = new Set<string>();
  const temp = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string) {
    if (temp.has(nodeId)) throw new Error(`Cycle detected at node ${nodeId}`);
    if (visited.has(nodeId)) return;

    temp.add(nodeId);
    const outgoingEdges = Array.from(graph.edges.values()).filter(
      (e) => e.sourceNodeId === nodeId,
    );
    for (const edge of outgoingEdges) visit(edge.targetNodeId);
    temp.delete(nodeId);
    visited.add(nodeId);
    result.push(nodeId);
  }

  for (const nodeId of graph.nodes.keys()) {
    if (!visited.has(nodeId)) visit(nodeId);
  }

  return result.reverse();
}
