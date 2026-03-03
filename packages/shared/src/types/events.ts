import type { ChatMessage } from './message.js';
import type { AgentStatus } from './agent.js';
import type { DiscussionState } from './discussion.js';

export type SSEEventType =
  | 'message:new'
  | 'message:stream'
  | 'agent:status'
  | 'discussion:state'
  | 'heartbeat';

export interface MessageNewEvent {
  type: 'message:new';
  data: ChatMessage;
}

export interface MessageStreamEvent {
  type: 'message:stream';
  data: {
    messageId: string;
    roomId: string;
    agentId: string;
    chunk: string;
    done: boolean;
  };
}

export interface AgentStatusEvent {
  type: 'agent:status';
  data: {
    agentId: string;
    status: AgentStatus;
    roomId?: string;
  };
}

export interface DiscussionStateEvent {
  type: 'discussion:state';
  data: DiscussionState;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  data: { timestamp: string };
}

export type SSEEvent =
  | MessageNewEvent
  | MessageStreamEvent
  | AgentStatusEvent
  | DiscussionStateEvent
  | HeartbeatEvent;
