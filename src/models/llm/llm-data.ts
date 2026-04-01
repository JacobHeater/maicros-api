export interface InferenceOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface LlmStreamChunk {
  content: string;
  isLastMessage: boolean;
}
