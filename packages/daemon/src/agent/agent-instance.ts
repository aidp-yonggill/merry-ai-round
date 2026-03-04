import { query } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'node:events';
import type { AgentDefinition, AgentStatus, ToolUseBlock, ChatMessage } from '@merry/shared';
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

export interface TurnResult {
  content: string;
  toolUseBlocks: ToolUseBlock[];
  sdkSessionId?: string;
  numTurns?: number;
  durationMs?: number;
}

export interface ExecuteTurnParams {
  roomId: string;
  messageId: string;
  prompt: string;
  recentMessages: ChatMessage[];
  agentNames: Map<string, string>;
  roomContext: { name: string; members: string[] };
}

export class AgentInstance extends EventEmitter {
  readonly id: string;
  readonly definition: AgentDefinition;

  private promptBuilder: PromptBuilder;
  private memoryStore?: MemoryStore;
  private sessionIds: Map<string, string> = new Map(); // roomId -> sessionId

  status: AgentStatus = 'idle';
  currentRoomId: string | null = null;
  totalTokensUsed = 0;
  totalCostUsd = 0;
  lastActiveAt: string | null = null;

  constructor(definition: AgentDefinition, memoryStore?: MemoryStore) {
    super();
    this.id = definition.id;
    this.definition = definition;
    this.promptBuilder = new PromptBuilder();
    this.memoryStore = memoryStore;
  }

  async executeTurn(params: ExecuteTurnParams): Promise<TurnResult> {
    const { roomId, messageId, prompt, recentMessages, agentNames, roomContext } = params;
    const startTime = Date.now();

    this.currentRoomId = roomId;
    this.lastActiveAt = new Date().toISOString();
    this.setStatus('thinking', roomId);

    // Build system prompt with persona, memory, room context
    const memoryContext = this.memoryStore?.getMemoryContext(this.id) ?? '';
    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      this.definition,
      roomContext,
      memoryContext || undefined,
    );

    // Build the turn prompt with conversation history
    const turnPrompt = this.promptBuilder.buildTurnPrompt(
      recentMessages,
      agentNames,
      prompt,
    );

    // Prepare SDK options
    const allowedTools = this.definition.tools.allowed.length > 0
      ? this.definition.tools.allowed
      : undefined;
    const disallowedTools = this.definition.tools.disallowed.length > 0
      ? this.definition.tools.disallowed
      : undefined;

    const sessionId = this.sessionIds.get(roomId);

    let content = '';
    const toolUseBlocks: ToolUseBlock[] = [];
    let newSessionId: string | undefined;
    let numTurns = 0;

    try {
      this.setStatus('responding', roomId);

      for await (const message of query({
        prompt: turnPrompt,
        options: {
          systemPrompt,
          model: MODEL_MAP[this.definition.model] ?? MODEL_MAP.sonnet,
          cwd: process.cwd(),
          allowedTools,
          disallowedTools,
          maxTurns: this.definition.maxTurns ?? 10,
          maxBudgetUsd: this.definition.maxBudgetUsd ?? 1.0,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          ...(sessionId ? { resume: sessionId } : {}),
        },
      })) {
        // Capture session ID for future resumption
        if (message.type === 'system' && message.subtype === 'init') {
          newSessionId = (message as any).session_id;
        }

        // Handle result message (final text output)
        if ('result' in message) {
          content = (message as any).result ?? '';

          // Emit final stream chunk
          this.emit('stream', {
            messageId,
            roomId,
            agentId: this.id,
            chunk: content,
            done: true,
          } satisfies StreamChunk);
        }

        // Handle assistant messages with content
        if (message.type === 'assistant') {
          const msg = message as any;

          // Stream text content
          if (msg.content) {
            const textContent = typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .filter((b: any) => b.type === 'text')
                    .map((b: any) => b.text)
                    .join('')
                : '';

            if (textContent) {
              this.emit('stream', {
                messageId,
                roomId,
                agentId: this.id,
                chunk: textContent,
                done: false,
              } satisfies StreamChunk);
            }

            // Extract tool use blocks
            if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === 'tool_use') {
                  const toolBlock: ToolUseBlock = {
                    id: block.id,
                    toolName: block.name,
                    input: block.input ?? {},
                    status: 'running',
                  };
                  toolUseBlocks.push(toolBlock);

                  this.emit('tool_use', {
                    messageId,
                    roomId,
                    agentId: this.id,
                    toolUseId: block.id,
                    toolName: block.name,
                    input: block.input ?? {},
                  });
                }
              }
            }

            numTurns++;
          }
        }

        // Handle tool results
        if (message.type === 'result' || (message as any).type === 'tool_result') {
          const msg = message as any;
          const toolUseId = msg.tool_use_id;
          if (toolUseId) {
            const block = toolUseBlocks.find(b => b.id === toolUseId);
            if (block) {
              block.status = msg.is_error ? 'error' : 'completed';
              block.output = typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            }

            this.emit('tool_complete', {
              messageId,
              roomId,
              agentId: this.id,
              toolUseId,
              toolName: block?.toolName ?? 'unknown',
              output: block?.output,
              isError: !!msg.is_error,
            });
          }
        }
      }

      // Save session ID for room-based resumption
      if (newSessionId) {
        this.sessionIds.set(roomId, newSessionId);
      }

      const durationMs = Date.now() - startTime;
      this.setStatus('idle', roomId);

      return {
        content,
        toolUseBlocks,
        sdkSessionId: newSessionId,
        numTurns,
        durationMs,
      };
    } catch (err: any) {
      this.setStatus('error', roomId);

      // Re-throw budget errors for caller handling
      if (err?.message?.includes('budget')) {
        throw err;
      }

      console.error(`[AgentInstance:${this.id}] Error during turn:`, err);
      throw err;
    }
  }

  private setStatus(status: AgentStatus, roomId?: string): void {
    this.status = status;
    this.emit('status', {
      agentId: this.id,
      status,
      roomId,
    });
  }

  stop(): void {
    this.setStatus('stopped');
    this.currentRoomId = null;
  }
}
