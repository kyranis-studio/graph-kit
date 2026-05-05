export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface StreamChunk {
  delta: string;
  thinking?: string;
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  fullContent?: string;
  fullThinking?: string;
}

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<string[]>;
}
