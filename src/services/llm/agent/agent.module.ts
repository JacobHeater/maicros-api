import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { LLMModule } from '../llm.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [LLMModule, ToolsModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
