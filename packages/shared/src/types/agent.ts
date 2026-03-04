export interface AgentToolConfig {
  allowed: string[];
  disallowed: string[];
}

export type ResponseTrigger = 'always' | 'tagged' | 'contextual' | 'called_by_agent' | 'manual';

export interface AgentBehaviorConfig {
  responseTrigger: ResponseTrigger;
  responseStyle: 'structured' | 'conversational' | 'brief';
  autoGreet: boolean;
  watchPatterns?: string[];
}

export interface AgentMemoryConfig {
  retentionDays: number;
  maxEntries: number;
  compactionModel?: 'haiku' | 'sonnet';
  synthesisModel?: 'haiku' | 'sonnet';
}

export interface AgentDefinition {
  id: string;
  slug: string;
  name: string;
  model: 'sonnet' | 'opus' | 'haiku';
  avatar: string;
  color: string;
  tags: string[];
  tools: AgentToolConfig;
  maxTurns: number;
  maxBudgetUsd: number;
  behavior: AgentBehaviorConfig;
  memory: AgentMemoryConfig;
  persona: string; // markdown body
  skipPermissions?: boolean; // default true for backward compat
}

export type AgentModel = AgentDefinition['model'];

export interface CreateAgentRequest {
  id: string;
  name: string;
  slug?: string;
  model?: AgentModel;
  avatar?: string;
  color?: string;
  tags?: string[];
  tools?: Partial<AgentToolConfig>;
  maxTurns?: number;
  maxBudgetUsd?: number;
  behavior?: Partial<AgentBehaviorConfig>;
  memory?: Partial<AgentMemoryConfig>;
  persona?: string;
  skipPermissions?: boolean;
}

export type AgentStatus = 'idle' | 'thinking' | 'responding' | 'error' | 'stopped';

export interface AgentState {
  id: string;
  definition: AgentDefinition;
  status: AgentStatus;
  currentRoomId: string | null;
  totalTokensUsed: number;
  totalCostUsd: number;
  lastActiveAt: string | null;
}
