import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'node:events';
import type { AgentDefinition, AgentStatus } from '@merry/shared';
import { PromptBuilder } from './prompt-builder.js';
import type { MemoryStore } from './memory-store.js';

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

export interface StreamChunk {
  messageId: string;
  roomId: string;
  agentId: string;
  chunk: string;
  done: boolean;
}

export class AgentInstance extends EventEmitter {
  readonly definition: AgentDefinition;
  private client: Anthropic;
  private promptBuilder: PromptBuilder;
  private memoryStore: MemoryStore | null;
  private conversationHistory: Map<string, Anthropic.MessageParam[]> = new Map();

  status: AgentStatus = 'idle';
  currentRoomId: string | null = null;
  totalTokensUsed = 0;
  totalCostUsd = 0;
  lastActiveAt: string | null = null;

  constructor(definition: AgentDefinition, client: Anthropic, memoryStore?: MemoryStore) {
    super();
    this.definition = definition;
    this.client = client;
    this.memoryStore = memoryStore ?? null;
    this.promptBuilder = new PromptBuilder();
  }

  get id(): string {
    return this.definition.id;
  }

  async executeTurn(params: {
    roomId: string;
    messageId: string;
    prompt: string;
    recentMessages: import('@merry/shared').ChatMessage[];
    agentNames: Map<string, string>;
    roomContext?: { name: string; members: string[] };
  }): Promise<string> {
    const { roomId, messageId, prompt, recentMessages, agentNames, roomContext } = params;

    // Enforce budget limit
    const maxBudget = this.definition.maxBudgetUsd;
    if (maxBudget && this.totalCostUsd >= maxBudget) {
      this.status = 'error';
      this.emit('status', { agentId: this.id, status: 'budget_exceeded', roomId });
      throw new Error(`Agent ${this.id} exceeded budget: $${this.totalCostUsd.toFixed(4)} >= $${maxBudget}`);
    }

    this.status = 'thinking';
    this.currentRoomId = roomId;
    this.emit('status', { agentId: this.id, status: this.status, roomId });

    const memoryContext = this.memoryStore?.getMemoryContext(this.id) || undefined;
    const systemPrompt = this.promptBuilder.buildSystemPrompt(this.definition, roomContext, memoryContext);
    const model = MODEL_MAP[this.definition.model] ?? MODEL_MAP.sonnet;

    // Get or initialize conversation history for this room
    if (!this.conversationHistory.has(roomId)) {
      this.conversationHistory.set(roomId, []);
    }
    const history = this.conversationHistory.get(roomId)!;

    // Build the user message from turn prompt
    const turnPrompt = this.promptBuilder.buildTurnPrompt(recentMessages, agentNames, prompt);

    // Add to history
    history.push({ role: 'user' as const, content: turnPrompt });

    // Token-aware history trimming: estimate tokens and trim if over budget
    // Context budget: ~60% of model context for history (rest for system prompt + memory + response)
    const maxHistoryTokens = model.includes('haiku') ? 60_000 : 80_000;
    await this.trimHistoryByTokens(history, model, systemPrompt, maxHistoryTokens);

    try {
      this.status = 'responding';
      this.emit('status', { agentId: this.id, status: this.status, roomId });

      let result = '';

      const stream = this.client.messages.stream({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: history,
      });

      stream.on('text', (delta) => {
        result += delta;
        this.emit('stream', {
          messageId,
          roomId,
          agentId: this.id,
          chunk: delta,
          done: false,
        } satisfies StreamChunk);
      });

      const finalMessage = await stream.finalMessage();

      // Emit done signal
      this.emit('stream', {
        messageId,
        roomId,
        agentId: this.id,
        chunk: '',
        done: true,
      } satisfies StreamChunk);

      // Track usage
      const usage = finalMessage.usage;
      this.totalTokensUsed += usage.input_tokens + usage.output_tokens;
      const inputCost = usage.input_tokens * (model.includes('opus') ? 0.000005 : model.includes('haiku') ? 0.000001 : 0.000003);
      const outputCost = usage.output_tokens * (model.includes('opus') ? 0.000025 : model.includes('haiku') ? 0.000005 : 0.000015);
      this.totalCostUsd += inputCost + outputCost;

      this.emit('cost', {
        agentId: this.id,
        roomId,
        tokensIn: usage.input_tokens,
        tokensOut: usage.output_tokens,
        costUsd: inputCost + outputCost,
      });

      // Add assistant response to history
      history.push({ role: 'assistant' as const, content: result });

      this.lastActiveAt = new Date().toISOString();
      this.status = 'idle';
      this.currentRoomId = null;
      this.emit('status', { agentId: this.id, status: this.status });

      return result;
    } catch (error) {
      this.status = 'error';
      this.emit('status', { agentId: this.id, status: this.status, roomId });
      throw error;
    }
  }

  private async trimHistoryByTokens(
    history: Anthropic.MessageParam[],
    model: string,
    systemPrompt: string,
    maxTokens: number,
  ): Promise<void> {
    if (history.length <= 2) return; // Always keep at least the last exchange

    try {
      const tokenCount = await this.client.messages.countTokens({
        model,
        system: systemPrompt,
        messages: history,
      });

      let currentTokens = tokenCount.input_tokens;
      while (currentTokens > maxTokens && history.length > 2) {
        // Remove oldest pair (user + assistant) to maintain alternation
        history.splice(0, 2);
        const recount = await this.client.messages.countTokens({
          model,
          system: systemPrompt,
          messages: history,
        });
        currentTokens = recount.input_tokens;
      }
    } catch {
      // Fallback: simple message count limit if token counting fails
      while (history.length > 30) {
        history.shift();
      }
    }
  }

  clearHistory(roomId: string): void {
    this.conversationHistory.delete(roomId);
  }

  stop(): void {
    this.status = 'stopped';
    this.emit('status', { agentId: this.id, status: this.status });
  }
}
