import { EventEmitter } from 'node:events';
import type { DiscussionState, DiscussionStatus, Room } from '@merry/shared';
import { AgentManager } from './agent-manager.js';
import { MessageRouter } from './message-router.js';
import { TurnController } from './turn-controller.js';
import { SSEManager } from '../api/sse/sse-manager.js';
import { SqliteStore } from '../storage/sqlite-store.js';

export class DiscussionEngine extends EventEmitter {
  private agentManager: AgentManager;
  private messageRouter: MessageRouter;
  private turnController: TurnController;
  private sse: SSEManager;
  private store: SqliteStore;

  private discussions: Map<string, DiscussionState> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(
    agentManager: AgentManager,
    messageRouter: MessageRouter,
    sse: SSEManager,
    store: SqliteStore,
  ) {
    super();
    this.agentManager = agentManager;
    this.messageRouter = messageRouter;
    this.turnController = new TurnController();
    this.sse = sse;
    this.store = store;
  }

  getState(roomId: string): DiscussionState {
    return this.discussions.get(roomId) ?? this.createIdleState(roomId);
  }

  private createIdleState(roomId: string): DiscussionState {
    return {
      roomId,
      status: 'idle',
      strategy: 'round-robin',
      currentTurn: null,
      turnHistory: [],
      totalTurns: 0,
      startedAt: null,
      pausedAt: null,
    };
  }

  async start(room: Room): Promise<DiscussionState> {
    const state: DiscussionState = {
      roomId: room.id,
      status: 'running',
      strategy: room.turnStrategy,
      currentTurn: null,
      turnHistory: [],
      totalTurns: 0,
      startedAt: new Date().toISOString(),
      pausedAt: null,
    };

    this.discussions.set(room.id, state);
    this.broadcastState(state);

    // Start the discussion loop
    this.runDiscussionLoop(room).catch(err => {
      console.error(`[DiscussionEngine] Error in room ${room.id}:`, err);
      this.updateStatus(room.id, 'stopped');
    });

    return state;
  }

  pause(roomId: string): DiscussionState | null {
    const state = this.discussions.get(roomId);
    if (!state || state.status !== 'running') return null;

    this.abortControllers.get(roomId)?.abort();
    this.updateStatus(roomId, 'paused');
    state.pausedAt = new Date().toISOString();
    return state;
  }

  async resume(room: Room): Promise<DiscussionState | null> {
    const state = this.discussions.get(room.id);
    if (!state || state.status !== 'paused') return null;

    this.updateStatus(room.id, 'running');
    state.pausedAt = null;

    this.runDiscussionLoop(room).catch(err => {
      console.error(`[DiscussionEngine] Error in room ${room.id}:`, err);
      this.updateStatus(room.id, 'stopped');
    });

    return state;
  }

  stop(roomId: string): DiscussionState | null {
    const state = this.discussions.get(roomId);
    if (!state) return null;

    this.abortControllers.get(roomId)?.abort();
    this.updateStatus(roomId, 'stopped');
    return state;
  }

  assignNextSpeaker(roomId: string, agentId: string): void {
    const state = this.discussions.get(roomId);
    if (state) {
      (state as any)._assignedAgent = agentId;
    }
  }

  private async runDiscussionLoop(room: Room): Promise<void> {
    const ac = new AbortController();
    this.abortControllers.set(room.id, ac);

    try {
      while (!ac.signal.aborted) {
        const state = this.discussions.get(room.id);
        if (!state || state.status !== 'running') break;

        // Determine next speaker
        const recentMessages = this.store.getMessages(room.id, 20);
        const lastAgentMsg = [...recentMessages].reverse().find(m => m.role === 'agent');
        const assigned = (state as any)._assignedAgent as string | undefined;
        delete (state as any)._assignedAgent;

        const nextAgent = this.turnController.getNextSpeaker({
          strategy: state.strategy,
          members: room.members,
          lastSpeaker: lastAgentMsg?.agentId ?? null,
          recentMessages,
          assignedAgent: assigned,
        });

        if (!nextAgent) break;

        const agent = this.agentManager.get(nextAgent);
        if (!agent) {
          console.warn(`[DiscussionEngine] Agent ${nextAgent} not found`);
          continue;
        }

        // Build agent name map
        const agentNames = new Map<string, string>();
        for (const memberId of room.members) {
          const a = this.agentManager.get(memberId);
          if (a) agentNames.set(memberId, a.definition.name);
        }

        // Create streaming placeholder
        const messageId = this.messageRouter.createStreamingPlaceholder(room.id, nextAgent);

        // Update turn state
        const turnNumber = state.totalTurns + 1;
        state.currentTurn = {
          turnNumber,
          agentId: nextAgent,
          startedAt: new Date().toISOString(),
          completedAt: null,
        };
        state.totalTurns = turnNumber;
        this.broadcastState(state);

        // Forward stream events to SSE
        const onStream = (chunk: any) => {
          this.sse.broadcast({ type: 'message:stream', data: chunk });
        };
        agent.on('stream', onStream);

        const onStatus = (s: any) => {
          this.sse.broadcast({ type: 'agent:status', data: s });
        };
        agent.on('status', onStatus);

        const onCost = (c: any) => {
          this.store.recordCost(c.agentId, c.roomId, c.tokensIn, c.tokensOut, c.costUsd);
        };
        agent.on('cost', onCost);

        try {
          const content = await agent.executeTurn({
            roomId: room.id,
            messageId,
            prompt: 'Please share your thoughts on the discussion above.',
            recentMessages,
            agentNames,
            roomContext: { name: room.name, members: room.members.map(m => agentNames.get(m) ?? m) },
          });

          // Save the completed message
          this.messageRouter.createMessage({
            roomId: room.id,
            role: 'agent',
            agentId: nextAgent,
            content,
            metadata: { turnNumber },
          });

          state.currentTurn.completedAt = new Date().toISOString();
          state.turnHistory.push({ ...state.currentTurn });
          state.currentTurn = null;
          this.broadcastState(state);
        } finally {
          agent.off('stream', onStream);
          agent.off('status', onStatus);
          agent.off('cost', onCost);
        }

        // Small delay between turns
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if there's a user message waiting (they may have typed while agent was responding)
        const latestMessages = this.store.getMessages(room.id, 1);
        if (latestMessages.length > 0 && latestMessages[latestMessages.length - 1].role === 'user') {
          // User intervened, continue the loop (next turn will consider user message)
          continue;
        }
      }
    } finally {
      this.abortControllers.delete(room.id);
    }
  }

  private updateStatus(roomId: string, status: DiscussionStatus): void {
    const state = this.discussions.get(roomId);
    if (state) {
      state.status = status;
      this.broadcastState(state);
    }
  }

  private broadcastState(state: DiscussionState): void {
    this.sse.broadcast({ type: 'discussion:state', data: state });
  }
}
