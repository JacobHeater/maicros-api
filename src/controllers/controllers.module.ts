import { Module } from '@nestjs/common';
import { ChatModule } from '@/services/chat/chat.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { ChatController } from './chat/chat.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ChatModule, AuthenticationModule],
  controllers: [ChatController, HealthController],
})
export class ControllersModule {}
