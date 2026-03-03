import type { TurnStrategy } from './room.js';

export type DiscussionStatus = 'idle' | 'running' | 'paused' | 'stopped';

export interface DiscussionTurn {
  turnNumber: number;
  agentId: string;
  startedAt: string;
  completedAt: string | null;
}

export interface DiscussionState {
  roomId: string;
  status: DiscussionStatus;
  strategy: TurnStrategy;
  currentTurn: DiscussionTurn | null;
  turnHistory: DiscussionTurn[];
  totalTurns: number;
  startedAt: string | null;
  pausedAt: string | null;
}

export interface AssignTurnRequest {
  agentId: string;
}
