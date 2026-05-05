import type { Graph } from '../types/index.ts';

export function bfs(graph: Graph, startNodeId: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const queue: string[] = [startNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    
    visited.add(nodeId);
    result.push(nodeId);

    const successors = graph.getSuccessors(nodeId);
    for (const successor of successors) {
      if (!visited.has(successor.id)) {
        queue.push(successor.id);
      }
    }
  }

  return result;
}

export function dfs(graph: Graph, startNodeId: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    result.push(nodeId);

    const successors = graph.getSuccessors(nodeId);
    for (const successor of successors) {
      visit(successor.id);
    }
  }

  visit(startNodeId);
  return result;
}
