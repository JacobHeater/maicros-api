import 'dotenv/config';
import 'reflect-metadata';
import io from 'readline-sync';
import { ServiceModule } from '@/services/service.module';
import { AgentService } from '@/services/llm/agents/agent.service';
import { ChatMessageRole } from '@/models/chat/chat-message';

const meal =
  process.env.MEAL ??
  io.question(`Hello, tell me about your meal! I'd be happy to analyze it for you!\n`);

if (!meal) {
  console.log('No meal provided. Exiting.');
  process.exit(0);
}

(async () => {
  const serviceModule = new ServiceModule();
  await serviceModule.initialize();

  const container = serviceModule.container;

  try {
    const agentService = container.get(AgentService);
    if (agentService) {
      const result = await agentService.run(meal, []);
      const messages = result.finalMessages.filter(
        message => message.role === ChatMessageRole.Assistant
      );

      for (const message of messages) {
        console.log(message.content);
      }
    }
  } catch (error) {
    console.error('An error occurred during execution:', error);
  }
})();
