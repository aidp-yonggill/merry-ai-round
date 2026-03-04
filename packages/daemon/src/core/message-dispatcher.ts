import { EventEmitter } from 'node:events';
import type { ChatMessage, AgentDefinition, AgentLookupEntry } from '@merry/shared';
import { parseMessage } from '@merry/shared';
import type { ProcessManager } from '../process/process-manager.js';
import type { AgentManager } from './agent-manager.js';
import type { MessageRouter } from './message-router.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { SSEManager } from '../api/sse/sse-manager.js';
import type { SqliteStore } from '../storage/sqlite-store.js';

const MAX_CHAIN_DEPTH = 5;
const CONTEXT_WINDOW_SIZE = 30; // Recent messages to include as context

/**
 * Event-based message dispatcher that replaces the discussion engine.
 * Routes messages to active agents based on their behavior rules.
 */
export class MessageDispatcher extends EventEmitter {
  private processManager: ProcessManager;
  private agentManager: AgentManager;
  private messageRouter: MessageRouter;
  private memoryManager: MemoryManager;
  private sse: SSEManager;
  private store: SqliteStore;

  // Track chain depth per room to prevent infinite agent loops
  private chainDepths = new Map<string, number>();

  constructor(
    processManager: ProcessManager,
    agentManager: AgentManager,
    messageRouter: MessageRouter,
    memoryManager: MemoryManager,
    sse: SSEManager,
    store: SqliteStore,
  ) {
    super();
    this.processManager = processManager;
    this.agentManager = agentManager;
    this.messageRouter = messageRouter;
    this.memoryManager = memoryManager;
    this.sse = sse;
    this.store = store;

    // Forward process events to SSE
    this.wireProcessEvents();
  }

  /**
   * Dispatch a message to all relevant agents in a room.
   * This is the main entry point — called when a user or agent sends a message.
   */
  async dispatch(roomId: string, message: ChatMessage): Promise<void> {
    const activeAgents = this.processManager.getRoomAgents(roomId);
    if (activeAgents.length === 0) return;

    // Build agent lookup for mention parsing
    const agentLookup = this.buildAgentLookup();
    const parsed = parseMessage(message.content, agentLookup);
    const mentionedAgentIds = new Set(parsed.mentions);

    // Track chain depth
    const isAgentMessage = message.role === 'agent';
    if (isAgentMessage) {
      const depth = (this.chainDepths.get(roomId) ?? 0) + 1;
      if (depth > MAX_CHAIN_DEPTH) {
        console.log(`[MessageDispatcher] Chain depth ${depth} exceeds max ${MAX_CHAIN_DEPTH} in room ${roomId}. Stopping.`);
        this.chainDepths.delete(roomId);
        return;
      }
      this.chainDepths.set(roomId, depth);
    } else {
      // User message resets chain
      this.chainDepths.set(roomId, 0);
    }

    // Record turn in short-term memory for all active agents
    for (const agentId of activeAgents) {
      this.memoryManager.appendTurn(agentId, roomId, {
        timestamp: message.createdAt,
        role: message.role,
        agentId: message.agentId,
        content: message.content,
        tokenEstimate: Math.ceil(message.content.length / 4),
      });
    }

    // Determine which agents should respond
    const respondingAgents: string[] = [];
    for (const agentId of activeAgents) {
      // Don't let an agent respond to itself
      if (message.agentId === agentId) continue;

      const agent = this.agentManager.get(agentId);
      if (!agent) continue;

      if (this.shouldAgentRespond(agent.definition, message, mentionedAgentIds)) {
        respondingAgents.push(agentId);
      }
    }

    // Send to responding agents (sequentially to avoid overlapping streams)
    for (const agentId of respondingAgents) {
      try {
        await this.sendToAgent(agentId, roomId, message);
      } catch (err) {
        console.error(`[MessageDispatcher] Error sending to agent ${agentId}:`, err);
      }
    }
  }

  /**
   * Determine if an agent should respond to a message based on its behavior rules.
   */
  private shouldAgentRespond(
    agent: AgentDefinition,
    message: ChatMessage,
    mentionedAgentIds: Set<string>,
  ): boolean {
    const trigger = agent.behavior.responseTrigger;

    switch (trigger) {
      case 'always':
        return true;

      case 'tagged':
        return mentionedAgentIds.has(agent.id);

      case 'called_by_agent':
        return message.role === 'agent' && mentionedAgentIds.has(agent.id);

      case 'manual':
        return false;

      default:
        return false;
    }
  }

  /**
   * Send a message to a specific agent and handle the response.
   */
  private async sendToAgent(agentId: string, roomId: string, triggerMessage: ChatMessage): Promise<void> {
    const agent = this.agentManager.get(agentId);
    if (!agent) return;

    // Build context: recent messages
    const recentMessages = this.messageRouter.getMessages(roomId, CONTEXT_WINDOW_SIZE);

    // Build context string for the agent
    const agentNames = this.buildAgentNameMap();
    const contextLines = recentMessages.map(msg => {
      const sender = msg.role === 'user'
        ? 'User'
        : agentNames.get(msg.agentId ?? '') ?? msg.agentId ?? 'Unknown';
      return `[${sender}]: ${msg.content}`;
    });

    const contextStr = contextLines.join('\n');
    const prompt = `Recent conversation:\n${contextStr}\n\nPlease respond to the discussion above. The latest message was from ${triggerMessage.role === 'user' ? 'a user' : agentNames.get(triggerMessage.agentId ?? '') ?? 'an agent'}.`;

    // Create streaming placeholder
    const messageId = this.messageRouter.createStreamingPlaceholder(roomId, agentId);

    try {
      const result = await this.processManager.sendToAgent(agentId, roomId, prompt, messageId);

      // Save agent response as a message
      const agentMessage = this.messageRouter.createMessage({
        roomId,
        role: 'agent',
        agentId,
        content: result.content,
        metadata: {
          toolUseBlocks: result.toolUseBlocks.length > 0 ? result.toolUseBlocks : undefined,
          numTurns: result.numTurns,
          durationMs: result.durationMs,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
        },
      });

      // Record cost
      if (result.tokensIn || result.tokensOut || result.costUsd) {
        this.store.recordCost(
          agentId,
          roomId,
          result.tokensIn ?? 0,
          result.tokensOut ?? 0,
          result.costUsd ?? 0,
        );
      }

      // Record in short-term memory
      this.memoryManager.appendTurn(agentId, roomId, {
        timestamp: new Date().toISOString(),
        role: 'agent',
        agentId,
        content: result.content,
        tokenEstimate: Math.ceil(result.content.length / 4),
      });

      // Recursively dispatch the agent's response (may trigger other agents)
      await this.dispatch(roomId, agentMessage);
    } catch (err) {
      console.error(`[MessageDispatcher] Agent ${agentId} failed in room ${roomId}:`, err);
    }
  }

  // ─── Helpers ───────────────────────────────────────

  private buildAgentLookup(): AgentLookupEntry[] {
    return this.agentManager.getAllDefinitions().map(d => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
    }));
  }

  private buildAgentNameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const def of this.agentManager.getAllDefinitions()) {
      map.set(def.id, def.name);
    }
    return map;
  }

  private wireProcessEvents(): void {
    // Forward streaming events to SSE
    this.processManager.on('stream', (chunk) => {
      this.sse.broadcast({ type: 'message:stream', data: chunk });
    });

    this.processManager.on('tool_use', (data) => {
      this.sse.broadcast({ type: 'tool:start', data });
    });

    this.processManager.on('tool_result', (data) => {
      this.sse.broadcast({ type: 'tool:complete', data });
    });

    // Forward instance lifecycle events to SSE
    for (const event of ['instance:spawning', 'instance:running', 'instance:stopped', 'instance:crashed'] as const) {
      this.processManager.on(event, (data) => {
        this.sse.broadcast({ type: event, data });
      });
    }

    this.processManager.on('instance:resource', (data) => {
      this.sse.broadcast({ type: 'instance:resource', data });
    });

    // Forward memory compaction events to SSE
    this.processManager.on('memory:compaction', (data) => {
      this.sse.broadcast({ type: 'memory:compaction', data });
    });
  }
}
