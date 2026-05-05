import { topologicalSort } from './sorting.ts';
import type { Graph } from '../types/index.ts';

export function validateGraph(graph: Graph): string[] {
  const errors: string[] = [];

  try {
    topologicalSort(graph);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Cycle detected')) errors.push(e.message);
  }

  for (const edge of graph.edges.values()) {
    if (!graph.nodes.has(edge.sourceNodeId)) {
      errors.push(`Edge ${edge.id} references non-existent source node ${edge.sourceNodeId}`);
    }
    if (!graph.nodes.has(edge.targetNodeId)) {
      errors.push(`Edge ${edge.id} references non-existent target node ${edge.targetNodeId}`);
    }
  }

  return errors;
}
