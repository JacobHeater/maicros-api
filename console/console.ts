import 'dotenv/config';
import io from 'readline-sync';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ToolRegistry } from '@/services/llm/tools/tool-registry.service';
import { FoodLookupTool } from '@/services/llm/tools/nutrition/food/food-lookup.tool';
import { FoodService } from '@/services/nutrition/food/food.service';
import { AgentService } from '@/services/llm/agent/agent.service';
import { ChatMessageRole } from '@/services/common/models/chat-message';

const meal =
  process.env.MEAL ??
  io.question(`Hello, tell me about your meal! I'd be happy to analyze it for you!\n`);

if (!meal) {
  console.log('No meal provided. Exiting.');
  process.exit(0);
}

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const toolRegistry = app.get(ToolRegistry);
    const foodService = app.get(FoodService);
    if (toolRegistry && foodService) {
      toolRegistry.register(new FoodLookupTool(foodService));
    }

    const agentService = app.get(AgentService);
    const result = await agentService.run(meal, []);
    const messages = result.finalMessages.filter(
      message => message.role === ChatMessageRole.Assistant
    );

    for (const message of messages) {
      console.log(message.content);
    }
  } finally {
    await app.close();
  }
})();
