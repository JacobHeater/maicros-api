import { MessageStatus } from './message-status';
import { ClientMessageType, ServerMessageType } from './message-type';

export interface WebSocketMessage {
  type: ClientMessageType | ServerMessageType;
  sessionId?: string;
  payload?: string;
  tool?: string;
  status?: MessageStatus;
}
