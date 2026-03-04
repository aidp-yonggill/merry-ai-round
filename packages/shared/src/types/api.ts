export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedRequest {
  limit?: number;
  before?: string; // cursor (message ID)
}

export interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  activeAgents: number;
  activeRooms: number;
  activeInstances: number;
}

export interface SystemConfig {
  version: string;
  agentsDir: string;
  dataDir: string;
  port: number;
}

export interface CostSummary {
  totalUsd: number;
  byAgent: Record<string, number>;
  byRoom: Record<string, number>;
}
