import type { NodeTypeDefinition } from '../../src/types/index.ts';

export function getAIEmbeddingNodeType(): NodeTypeDefinition {
  return {
    inputs: [
      { id: 'text', name: 'Text', type: 'string', required: true },
      { id: 'model', name: 'Model', type: 'string', required: false, defaultValue: 'nomic-embed-text' },
    ],
    outputs: [
      { id: 'embedding', name: 'Embedding', type: 'array', required: false },
    ],
    execute: async (inputs: any) => {
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: inputs.model,
          prompt: inputs.text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding failed: ${response.statusText}`);
      }
      const data = await response.json();
      return { embedding: data.embedding };
    },
    metadata: { label: 'AI Embedding', category: 'AI', color: '#6366f1' },
  };
}
