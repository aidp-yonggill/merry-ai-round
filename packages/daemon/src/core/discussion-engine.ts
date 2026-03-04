import { EventEmitter } from 'node:events';
import type { DiscussionState, DiscussionStatus, Room } from '@merry/shared';
import { AgentManager } from './agent-manager.js';
import { MessageRouter } from './message-router.js';
import { TurnController } from './turn-controller.js';
import { SSEManager } from '../api/sse/sse-manager.js';
import { SqliteStore } from '../storage/sqlite-store.js';
import type { MemoryStore } from '../agent/memory-store.js';

export class DiscussionEngine extends EventEmitter {
  private agentManager: AgentManager;
  private messageRouter: MessageRouter;
  private turnController: TurnController;
  private sse: SSEManager;
  private store: SqliteStore;
  private memoryStore: MemoryStore | null;

  private discussions: Map<string, DiscussionState> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(
    agentManager: AgentManager,
    messageRouter: MessageRouter,
    sse: SSEManager,
    store: SqliteStore,
    memoryStore?: MemoryStore,
  ) {
    super();
    this.agentManager = agentManager;
    this.messageRouter = messageRouter;
    this.turnController = new TurnController();
    this.sse = sse;
    this.store = store;
    this.memoryStore = memoryStore ?? null;
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
      // Max turns per discussion (configurable per room, default 50)
      const maxDiscussionTurns = 50;

      while (!ac.signal.aborted) {
        const state = this.discussions.get(room.id);
        if (!state || state.status !== 'running') break;

        // Enforce discussion-level turn limit
        if (state.totalTurns >= maxDiscussionTurns) {
          console.log(`[DiscussionEngine] Room ${room.id} reached max turns (${maxDiscussionTurns})`);
          this.updateStatus(room.id, 'stopped');
          break;
        }

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

        if (!nextAgent) {
          // In directed mode, wait for user to assign a speaker instead of exiting
          if (state.strategy === 'directed') {
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
          break;
        }

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

        // Forward stream/status/tool events to SSE
        const onStream = (chunk: any) => {
          this.sse.broadcast({ type: 'message:stream', data: chunk });
        };
        agent.on('stream', onStream);

        const onStatus = (s: any) => {
          this.sse.broadcast({ type: 'agent:status', data: s });
        };
        agent.on('status', onStatus);

        const onToolUse = (t: any) => {
          this.sse.broadcast({ type: 'tool:start', data: t });
        };
        agent.on('tool_use', onToolUse);

        const onToolComplete = (t: any) => {
          this.sse.broadcast({ type: 'tool:complete', data: t });
        };
        agent.on('tool_complete', onToolComplete);

        try {
          const result = await agent.executeTurn({
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
            content: result.content,
            metadata: {
              turnNumber,
              toolUseBlocks: result.toolUseBlocks.length > 0 ? result.toolUseBlocks : undefined,
              sdkSessionId: result.sdkSessionId,
              numTurns: result.numTurns,
              durationMs: result.durationMs,
            },
          });

          state.currentTurn.completedAt = new Date().toISOString();
          state.turnHistory.push({ ...state.currentTurn });
          state.currentTurn = null;
          this.broadcastState(state);

          // Extract facts from response for agent memory
          this.extractAndStoreFacts(nextAgent, result.content, room.id);
        } catch (err: any) {
          if (err?.message?.includes('budget')) {
            console.warn(`[DiscussionEngine] Agent ${nextAgent} budget exceeded, skipping`);
            this.messageRouter.createMessage({
              roomId: room.id,
              role: 'system',
              content: `${agent.definition.name} has exceeded their budget limit and will no longer participate.`,
              metadata: { turnNumber },
            });
            state.currentTurn = null;
            this.broadcastState(state);
          } else {
            throw err;
          }
        } finally {
          agent.off('stream', onStream);
          agent.off('status', onStatus);
          agent.off('tool_use', onToolUse);
          agent.off('tool_complete', onToolComplete);
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

  private extractAndStoreFacts(agentId: string, content: string, roomId: string): void {
    if (!this.memoryStore) return;

    // Simple rule-based fact extraction from agent responses
    const sentences = content.split(/[.!?]\s+/).filter(s => s.length > 20);
    const factPatterns = [
      /결론[은:]?\s*/i,
      /중요한\s*점/i,
      /핵심[은:]?\s*/i,
      /요약하[면자]/i,
      /therefore/i,
      /in conclusion/i,
      /key point/i,
      /important(ly)?/i,
      /recommend/i,
      /suggest/i,
    ];

    const facts: string[] = [];
    for (const sentence of sentences) {
      if (factPatterns.some(p => p.test(sentence)) && facts.length < 3) {
        facts.push(sentence.trim());
      }
    }

    // If no pattern matches, take the last meaningful sentence as a conclusion
    if (facts.length === 0 && sentences.length > 0) {
      const last = sentences[sentences.length - 1].trim();
      if (last.length > 30) facts.push(last);
    }

    for (const fact of facts) {
      this.memoryStore.addFact(agentId, {
        fact,
        source: `room:${roomId}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private broadcastState(state: DiscussionState): void {
    this.sse.broadcast({ type: 'discussion:state', data: state });
  }
}
