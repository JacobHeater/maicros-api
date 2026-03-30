import { Module } from '@nestjs/common';

import { ChatGateway } from './chat/chat.gateway';
import { AgentModule } from '@/services/llm/agent/agent.module';
import { LLMModule } from '@/services/llm/llm.module';
import { ChatModule } from '@/services/chat/chat.module';

@Module({
  imports: [AgentModule, LLMModule, ChatModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class WsModule {}
