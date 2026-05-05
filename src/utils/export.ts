import type { Graph } from '../types/index.ts';

export function toMermaid(graph: Graph): string {
  let mermaid = 'graph TD\n';
  for (const node of graph.nodes.values()) {
    mermaid += `  ${node.id}[${node.type}]\n`;
  }
  for (const edge of graph.edges.values()) {
    mermaid += `  ${edge.sourceNodeId} --> ${edge.targetNodeId}\n`;
  }
  return mermaid;
}

export function toDOT(graph: Graph): string {
  let dot = 'digraph G {\n';
  for (const node of graph.nodes.values()) {
    dot += `  "${node.id}" [label="${node.type}"];\n`;
  }
  for (const edge of graph.edges.values()) {
    dot += `  "${edge.sourceNodeId}" -> "${edge.targetNodeId}";\n`;
  }
  dot += '}';
  return dot;
}
