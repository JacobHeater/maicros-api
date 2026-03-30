import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './controllers/health/health.controller';
import { ChatModule } from './services/chat/chat.module';
import { LLMModule } from './services/llm/llm.module';
import { NutritionModule } from './services/nutrition/nutrition.module';
import { ControllersModule } from './controllers/controllers.module';
import { ToolsModule } from './services/llm/tools/tools.module';
import { AgentModule } from './services/llm/agent/agent.module';
import { WsModule } from './websockets/ws.module';

@Module({
  imports: [
    ChatModule,
    LLMModule,
    NutritionModule,
    ControllersModule,
    ToolsModule,
    AgentModule,
    WsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
