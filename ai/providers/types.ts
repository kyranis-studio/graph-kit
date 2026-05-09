export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  message: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  delta: string;
  thinking?: string;
  done?: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  fullContent?: string;
  fullThinking?: string;
  tool_calls?: ToolCall[];
}

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<string[]>;
}
