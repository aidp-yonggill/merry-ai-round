export type MessageRole = 'user' | 'agent' | 'system';

export type ToolUseStatus = 'running' | 'completed' | 'error';

export interface ToolUseBlock {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  status: ToolUseStatus;
  durationMs?: number;
}

export interface MessageMetadata {
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  turnNumber?: number;
  mentions?: string[];
  replyTo?: string;
  toolUseBlocks?: ToolUseBlock[];
  sdkSessionId?: string;
  numTurns?: number;
  durationMs?: number;
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
