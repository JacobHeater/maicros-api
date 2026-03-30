import { Injectable, Logger } from '@nestjs/common';

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
  }

  async embed(text: string): Promise<number[]> {
    const maxRetries = 3;
    const timeoutMs = Number(process.env.EMBED_TIMEOUT_MS) || 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, input: text }),
          signal: controller.signal,
        });
        clearTimeout(id);

        if (!response.ok) {
          const txt = await response.text().catch(() => '');
          throw new Error(`Embedding API error: ${response.status} ${txt}`);
        }

        const json = (await response.json()) as OllamaEmbeddingResponse | OllamaEmbeddingResponse[];
        // Support multiple response shapes: { embedding: [...] } or [{ embedding: [...] }]
        if (!json) throw new Error('Empty response from embedding API');
        if (Array.isArray(json) && json[0] && Array.isArray(json[0].embedding)) {
          return json[0].embedding as number[];
        }
        if (
          (json as OllamaEmbeddingResponse).embedding &&
          Array.isArray((json as OllamaEmbeddingResponse).embedding)
        ) {
          return (json as OllamaEmbeddingResponse).embedding as number[];
        }

        // Fallback: try common providers shape
        if (
          (json as any).data &&
          Array.isArray((json as any).data) &&
          (json as any).data[0]?.embedding
        ) {
          return (json as any).data[0].embedding as number[];
        }

        throw new Error('Unexpected embedding response shape');
      } catch (err) {
        clearTimeout(id);
        this.logger.warn(`Embedding attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt === maxRetries) throw err;
        // small backoff
        await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
    throw new Error('Unreachable');
  }

  /**
   * Embed a large batch with controlled concurrency.
   */
  async embedBatch(texts: string[], concurrency = 10): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    let idx = 0;

    const worker = async () => {
      while (idx < texts.length) {
        const i = idx++;
        results[i] = await this.embed(texts[i]);
        if (i % 500 === 0) this.logger.log(`Embedding: ${i}/${texts.length}`);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
