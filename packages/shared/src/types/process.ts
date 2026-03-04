export type InstanceStatus = 'spawning' | 'running' | 'idle' | 'stopping' | 'stopped' | 'crashed';

export interface AgentInstanceInfo {
  instanceId: string;
  agentId: string;
  roomId: string;
  status: InstanceStatus;
  pid?: number;
  spawnedAt: string;
  lastActiveAt: string | null;
  tokensUsed: number;
  costUsd: number;
}
