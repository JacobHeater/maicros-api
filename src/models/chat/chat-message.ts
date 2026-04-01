export enum ChatMessageRole {
  User = 'user',
  System = 'system',
  Assistant = 'assistant',
}

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  toolName?: string;
}
