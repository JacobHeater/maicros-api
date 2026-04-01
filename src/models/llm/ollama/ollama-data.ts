export interface OllamaMessage {
  content: string;
}

export interface OllamaResponse {
  message: OllamaMessage;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}
