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

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  listModels(): Promise<string[]>;
}
