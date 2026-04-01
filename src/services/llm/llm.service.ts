import { ChatMessage } from '@//models/chat/chat-message';
import { InferenceOptions } from '@//models/llm/llm-data';
import { ServiceBase } from '../service-base';
import { OllamaResponse } from '@//models/llm/ollama/ollama-data';
import { Injectable } from '../injectable';

@Injectable()
export class LLMService extends ServiceBase {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    super();

    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL ?? 'qwen2.5:32b-instruct-q3_K_L';
  }

  async complete(
    messages: ChatMessage[],
    options: InferenceOptions = {},
    signal?: AbortSignal
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model ?? this.model,
          messages,
          stream: false,
          options: {
            num_predict: options.maxTokens ?? 1024,
            temperature: options.temperature ?? 0.2,
          },
        }),
        signal,
      });
    } catch (err) {
      this.logger.error(`fetch to ${this.baseUrl}/api/chat failed: ${String(err)}`);
      throw new Error(`fetch failed: ${String(err)}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '<no body>');
      this.logger.error(`Ollama error: ${response.status} ${response.statusText} - ${text}`);
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return data.message.content;
  }

  async *stream(
    messages: ChatMessage[],
    options: InferenceOptions = {},
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? this.model,
        messages,
        stream: true,
        options: {
          num_predict: options.maxTokens ?? 1024,
          temperature: options.temperature ?? 0.2,
        },
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '<no body>');
      this.logger.error(`Ollama stream error: ${response.status} ${response.statusText} - ${text}`);
      throw new Error(`Ollama stream error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        // Always process value if present — some servers send the final
        // payload together with done=true. Decode and parse any chunk
        // received before honoring the `done` flag.
        if (value && value.length) {
          const text = decoder.decode(value, { stream: !done });
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                yield parsed.message.content as string;
              }
            } catch {
              this.logger.warn(`Unparseable stream chunk: ${line}`);
            }
          }
        }

        if (done || signal?.aborted) break;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
