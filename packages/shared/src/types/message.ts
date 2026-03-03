export type MessageRole = 'user' | 'agent' | 'system';

export interface MessageMetadata {
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  turnNumber?: number;
  mentions?: string[];
  replyTo?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  role: MessageRole;
  agentId: string | null; // null for user messages
  content: string;
  metadata: MessageMetadata;
  createdAt: string;
}

export interface SendMessageRequest {
  content: string;
  agentId?: string; // if user wants to address specific agent
}
