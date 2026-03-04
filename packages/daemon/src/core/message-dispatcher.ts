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
   * @param respondedAgents - tracks agents that already responded in this chain to prevent duplicates
   */
  async dispatch(roomId: string, message: ChatMessage, respondedAgents?: Set<string>): Promise<void> {
    const activeAgents = this.processManager.getRoomAgents(roomId);
    if (activeAgents.length === 0) {
      console.log(`[Dispatch] ⚠️  No active agents in room ${roomId} — skipping dispatch`);
      return;
    }

    // Create or reuse the responded agents set for the entire chain
    const responded = respondedAgents ?? new Set<string>();

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

    // Split agents into immediate responders and contextual candidates
    const immediateResponders: string[] = [];
    const contextualCandidates: { id: string; def: AgentDefinition }[] = [];

    for (const agentId of activeAgents) {
      if (agentId === message.agentId) continue;
      // Skip agents that already responded in this chain
      if (responded.has(agentId)) {
        console.log(`[Dispatch] ⏭️  ${this.agentManager.get(agentId)?.definition.name ?? agentId} already responded in chain — skipping`);
        continue;
      }
      const agent = this.agentManager.get(agentId);
      if (!agent) continue;

      const trigger = agent.definition.behavior.responseTrigger;
      if (trigger === 'always') {
        immediateResponders.push(agentId);
      } else if (trigger === 'tagged' && mentionedAgentIds.has(agentId)) {
        immediateResponders.push(agentId);
      } else if (trigger === 'contextual' && mentionedAgentIds.has(agentId)) {
        immediateResponders.push(agentId);
      } else if (trigger === 'contextual') {
        contextualCandidates.push({ id: agentId, def: agent.definition });
      } else if (trigger === 'called_by_agent' && message.role === 'agent' && mentionedAgentIds.has(agentId)) {
        immediateResponders.push(agentId);
      }
    }

    // Log dispatch decisions
    if (immediateResponders.length > 0) {
      const names = immediateResponders.map(id => this.agentManager.get(id)?.definition.name ?? id);
      console.log(`[Dispatch] 📨 "${message.content.slice(0, 60)}${message.content.length > 60 ? '...' : ''}" → ${names.join(', ')}`);
    }
    if (contextualCandidates.length > 0) {
      const cNames = contextualCandidates.map(c => c.def.name);
      console.log(`[Dispatch] 🔍 Batch checking: ${cNames.join(', ')}`);
    }

    // Run immediate sends and batch relevance check in parallel
    const immediateWork = async () => {
      for (const agentId of immediateResponders) {
        try {
          await this.sendToAgent(agentId, roomId, message, responded);
        } catch (err) {
          console.error(`[Dispatch] ❌ Agent ${agentId} error:`, err);
        }
      }
    };

    const contextualWork = async () => {
      if (contextualCandidates.length === 0) return;
      const contextualResponders = this.batchRelevanceCheck(contextualCandidates, message, roomId);
      if (contextualResponders.length > 0) {
        const names = contextualResponders.map(id => this.agentManager.get(id)?.definition.name ?? id);
        console.log(`[Dispatch] 📨 (contextual) → ${names.join(', ')}`);
      }
      for (const agentId of contextualResponders) {
        try {
          await this.sendToAgent(agentId, roomId, message, responded);
        } catch (err) {
          console.error(`[Dispatch] ❌ Agent ${agentId} error:`, err);
        }
      }
    };

    await Promise.all([immediateWork(), contextualWork()]);
  }

  /**
   * Fast keyword-based relevance check for contextual agents.
   * Matches message content against agent tags, name, and common domain keywords.
   */
  private batchRelevanceCheck(
    candidates: { id: string; def: AgentDefinition }[],
    message: ChatMessage,
    _roomId: string,
  ): string[] {
    if (candidates.length === 0) return [];

    const text = message.content.toLowerCase();

    const results: string[] = [];
    for (const c of candidates) {
      // Check if any tag appears in the message
      const tagMatch = c.def.tags.some(tag =>
        text.includes(tag.toLowerCase()),
      );

      // Check if agent name appears in the message
      const nameMatch = text.includes(c.def.name.toLowerCase());

      if (tagMatch || nameMatch) {
        console.log(`[Dispatch] 🎯 ${c.def.name} matched by ${tagMatch ? 'tag' : 'name'}`);
        results.push(c.id);
      }
    }

    if (results.length === 0) {
      console.log(`[Dispatch] 🎯 No contextual matches for: "${message.content.slice(0, 60)}"`);
    }

    return results;
  }

  /**
   * Send a message to a specific agent and handle the response.
   */
  private async sendToAgent(agentId: string, roomId: string, triggerMessage: ChatMessage, respondedAgents: Set<string>): Promise<void> {
    const agent = this.agentManager.get(agentId);
    if (!agent) return;

    // Double-check: another branch may have processed this agent while we were queued
    if (respondedAgents.has(agentId)) {
      console.log(`[Dispatch] ⏭️  ${agent.definition.name} already responded in chain — skipping`);
      return;
    }
    respondedAgents.add(agentId);

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
    const agentName = agent.definition.name;
    console.log(`[Dispatch] 🤔 ${agentName} thinking...`);

    try {
      const result = await this.processManager.sendToAgent(agentId, roomId, prompt, messageId);
      console.log(`[Dispatch] ✅ ${agentName} responded (${result.tokensIn ?? 0}+${result.tokensOut ?? 0} tokens, $${(result.costUsd ?? 0).toFixed(4)})`);

      // Skip empty responses (e.g. budget exceeded agents) — but allow tool-only responses
      if ((!result.content || result.content.trim().length === 0) && result.toolUseBlocks.length === 0) {
        console.log(`[Dispatch] ⚠️  ${agentName} returned empty response — skipping message save`);
        // Cancel the streaming placeholder so the UI doesn't show a stuck "thinking" state
        this.sse.broadcast({ type: 'message:cancelled', data: { roomId, agentId, messageId } });
        return;
      }

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
      await this.dispatch(roomId, agentMessage, respondedAgents);
    } catch (err) {
      console.error(`[MessageDispatcher] Agent ${agentId} failed in room ${roomId}:`, err);
      // Clean up chainDepths to prevent leaked state on error
      this.chainDepths.delete(roomId);
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
