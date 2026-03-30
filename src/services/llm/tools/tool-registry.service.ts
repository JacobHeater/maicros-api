import { Injectable } from '@nestjs/common';
import { BaseTool, ToolCall, ToolDefinition, ToolResult } from './tools.interfaces';

@Injectable()
export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool) {
    this.tools.set(tool.definition.name, tool);
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map(t => t.definition);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.toolName);
    if (!tool) {
      return { toolName: call.toolName, result: null, error: `Unknown tool: ${call.toolName}` };
    }
    try {
      return { toolName: call.toolName, result: await tool.execute(call.args) };
    } catch (err) {
      return { toolName: call.toolName, result: null, error: err.message };
    }
  }
}
