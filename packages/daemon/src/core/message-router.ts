import type { ChatMessage, MessageRole, MessageMetadata } from '@merry/shared';
import { generateMessageId, parseMessage } from '@merry/shared';
import { SqliteStore } from '../storage/sqlite-store.js';
import { SSEManager } from '../api/sse/sse-manager.js';

export class MessageRouter {
  private store: SqliteStore;
  private sse: SSEManager;

  constructor(store: SqliteStore, sse: SSEManager) {
    this.store = store;
    this.sse = sse;
  }

  createMessage(params: {
    roomId: string;
    role: MessageRole;
    agentId?: string;
    content: string;
    metadata?: Partial<MessageMetadata>;
  }): ChatMessage {
    const parsed = parseMessage(params.content);

    const message: ChatMessage = {
      id: generateMessageId(),
      roomId: params.roomId,
      role: params.role,
      agentId: params.agentId ?? null,
      content: params.content,
      metadata: {
        ...params.metadata,
        mentions: parsed.mentions,
      },
      createdAt: new Date().toISOString(),
    };

    this.store.saveMessage(message);
    this.sse.broadcast({
      type: 'message:new',
      data: message,
    });

    return message;
  }

  getMessages(roomId: string, limit?: number, before?: string): ChatMessage[] {
    return this.store.getMessages(roomId, limit, before);
  }

  /**
   * Creates a placeholder message for streaming, broadcasts it later when done.
   */
  createStreamingPlaceholder(roomId: string, agentId: string): string {
    return generateMessageId();
  }
}
