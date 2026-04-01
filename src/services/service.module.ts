import { IModule } from '@/module';
import { ServiceContainer } from '@/services/service-container';
import { getInjectableRegistry } from '@/services/injectable';
import { ToolRegistryService } from '@/services/llm/tools/tool-registry.service';
import { BaseTool } from '@/services/llm/tools/tools.interfaces';

// Import all injectable services so their @Injectable() decorators fire and
// they self-register into the global registry.
import '@/services/session/session.service';
import '@/services/llm/llm.service';
import '@/services/llm/tools/tool-registry.service';
import '@/services/llm/agents/food/meal-decomposition.agent';
import '@/services/llm/agents/nutrition/macronutrient.agent';
import '@/services/llm/agents/nutrition/micronutrient.agent';
import '@/services/llm/agents/nutrition/suggestion.agent';
import '@/services/llm/agents/newton/newton.agent';
import '@/services/nutrition/food.service';
import '@/services/llm/tools/nutrition/food/food-lookup.tool';

export class ServiceModule implements IModule {
  public readonly container = new ServiceContainer();

  async initialize(): Promise<void> {
    this.container.autoRegisterAll(getInjectableRegistry());
    await this.container.initAll();

    // Auto-wire every resolved BaseTool into the ToolRegistryService.
    const toolRegistry = this.container.get(ToolRegistryService)!;
    for (const tool of this.container.getAll(BaseTool)) {
      toolRegistry.register(tool);
    }
  }
}
