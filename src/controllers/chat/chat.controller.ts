import { SessionService } from '@/services/chat/session.service';
import { Controller, Delete, Get, Param } from '@nestjs/common';

@Controller('sessions')
export class ChatController {
  constructor(private readonly sessions: SessionService) {}

  @Get(':sessionId/history')
  getHistory(@Param('sessionId') sessionId: string) {
    return { messages: this.sessions.getHistory(sessionId) };
  }

  @Delete(':sessionId')
  clearSession(@Param('sessionId') sessionId: string): void {
    this.sessions.clearSession(sessionId);
  }
}
