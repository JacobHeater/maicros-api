import { logger } from '@//logging/logger';
import { ILogger } from '@//logging/logger-base';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  result: unknown;
  error?: string;
}

export abstract class BaseTool {
  protected logger: ILogger = logger;
  abstract definition: ToolDefinition;
  abstract execute(args: Record<string, unknown>): Promise<unknown>;
}
