import type { ChatMessage } from './message.js';
import type { AgentStatus } from './agent.js';
import type { AgentInstanceInfo } from './process.js';

export type SSEEventType =
  | 'message:new'
  | 'message:stream'
  | 'agent:status'
  | 'instance:spawning'
  | 'instance:running'
  | 'instance:stopped'
  | 'instance:crashed'
  | 'instance:resource'
  | 'memory:compaction'
  | 'tool:start'
  | 'tool:progress'
  | 'tool:complete'
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

export interface InstanceSpawningEvent {
  type: 'instance:spawning';
  data: AgentInstanceInfo;
}

export interface InstanceRunningEvent {
  type: 'instance:running';
  data: AgentInstanceInfo;
}

export interface InstanceStoppedEvent {
  type: 'instance:stopped';
  data: { instanceId: string; agentId: string; roomId: string };
}

export interface InstanceCrashedEvent {
  type: 'instance:crashed';
  data: { instanceId: string; agentId: string; roomId: string; error: string };
}

export interface InstanceResourceEvent {
  type: 'instance:resource';
  data: {
    instanceId: string;
    agentId: string;
    roomId: string;
    tokensUsed: number;
    costUsd: number;
  };
}

export interface MemoryCompactionEvent {
  type: 'memory:compaction';
  data: {
    agentId: string;
    roomId?: string;
    phase: 'started' | 'compacting' | 'synthesizing' | 'completed' | 'failed';
    message?: string;
  };
}

export interface ToolStartEvent {
  type: 'tool:start';
  data: {
    messageId: string;
    roomId: string;
    agentId: string;
    toolUseId: string;
    toolName: string;
    input: Record<string, unknown>;
  };
}

export interface ToolProgressEvent {
  type: 'tool:progress';
  data: {
    messageId: string;
    roomId: string;
    agentId: string;
    toolUseId: string;
    toolName: string;
    content: string;
  };
}

export interface ToolCompleteEvent {
  type: 'tool:complete';
  data: {
    messageId: string;
    roomId: string;
    agentId: string;
    toolUseId: string;
    toolName: string;
    output?: string;
    isError: boolean;
  };
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  data: { timestamp: string };
}

export type SSEEvent =
  | MessageNewEvent
  | MessageStreamEvent
  | AgentStatusEvent
  | InstanceSpawningEvent
  | InstanceRunningEvent
  | InstanceStoppedEvent
  | InstanceCrashedEvent
  | InstanceResourceEvent
  | MemoryCompactionEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolCompleteEvent
  | HeartbeatEvent;
