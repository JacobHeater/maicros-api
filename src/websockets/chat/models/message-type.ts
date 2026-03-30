export enum ClientMessageType {
  ChatMessage = 'chat_message',
  Cancel = 'cancel',
  Clear = 'clear',
}

export enum ServerMessageType {
  ToolStatus = 'tool_status',
  Token = 'token',
  Done = 'done',
  Error = 'error',
  Canceled = 'canceled',
}
