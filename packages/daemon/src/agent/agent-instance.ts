import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'node:events';
import type { AgentDefinition, AgentStatus } from '@merry/shared';
import { PromptBuilder } from './prompt-builder.js';

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
  private conversationHistory: Map<string, Anthropic.MessageParam[]> = new Map();

  status: AgentStatus = 'idle';
  currentRoomId: string | null = null;
  totalTokensUsed = 0;
  totalCostUsd = 0;
  lastActiveAt: string | null = null;

  constructor(definition: AgentDefinition, client: Anthropic) {
    super();
    this.definition = definition;
    this.client = client;
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

    this.status = 'thinking';
    this.currentRoomId = roomId;
    this.emit('status', { agentId: this.id, status: this.status, roomId });

    const systemPrompt = this.promptBuilder.buildSystemPrompt(this.definition, roomContext);
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

    // Keep history manageable (last 20 exchanges)
    while (history.length > 40) {
      history.shift();
    }

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

  clearHistory(roomId: string): void {
    this.conversationHistory.delete(roomId);
  }

  stop(): void {
    this.status = 'stopped';
    this.emit('status', { agentId: this.id, status: this.status });
  }
}
