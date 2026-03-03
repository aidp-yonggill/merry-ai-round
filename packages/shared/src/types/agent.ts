export interface AgentToolConfig {
  allowed: string[];
  disallowed: string[];
}

export interface AgentDiscussionConfig {
  responseStyle: 'structured' | 'conversational' | 'brief';
  initiatesTopics: boolean;
  mentionsBias: string[];
}

export interface AgentMemoryConfig {
  retentionDays: number;
  maxEntries: number;
}

export interface AgentDefinition {
  id: string;
  name: string;
  model: 'sonnet' | 'opus' | 'haiku';
  avatar: string;
  color: string;
  tags: string[];
  tools: AgentToolConfig;
  maxTurns: number;
  maxBudgetUsd: number;
  discussion: AgentDiscussionConfig;
  memory: AgentMemoryConfig;
  persona: string; // markdown body
}

export type AgentStatus = 'idle' | 'thinking' | 'responding' | 'error' | 'stopped';

export interface AgentState {
  id: string;
  definition: AgentDefinition;
  status: AgentStatus;
  sessionId: string | null;
  currentRoomId: string | null;
  totalTokensUsed: number;
  totalCostUsd: number;
  lastActiveAt: string | null;
}
