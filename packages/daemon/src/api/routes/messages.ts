import { Router } from 'express';
import type { MessageRouter } from '../../core/message-router.js';
import type { RoomManager } from '../../core/room-manager.js';
import type { MessageDispatcher } from '../../core/message-dispatcher.js';
import type { ApiResponse, SendMessageRequest } from '@merry/shared';

export function messageRoutes(
  messageRouter: MessageRouter,
  roomManager: RoomManager,
  dispatcher: MessageDispatcher,
): Router {
  const router = Router();

  // GET /api/rooms/:id/messages
  router.get('/:id/messages', (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string | undefined;
    const messages = messageRouter.getMessages(req.params.id, limit, before);

    const hasMore = messages.length === limit;
    res.json({
      ok: true,
      data: {
        items: messages,
        hasMore,
        nextCursor: hasMore ? messages[0]?.id : undefined,
      },
    } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/messages
  router.post('/:id/messages', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }

    const body = req.body as SendMessageRequest;
    if (!body.content) {
      res.status(400).json({ ok: false, error: 'content is required' } satisfies ApiResponse);
      return;
    }

    // Save user message
    const userMessage = messageRouter.createMessage({
      roomId: room.id,
      role: 'user',
      content: body.content,
    });

    // Send response immediately — agent responses come via SSE
    res.json({ ok: true, data: userMessage } satisfies ApiResponse);

    // Dispatch to active agents asynchronously
    try {
      await dispatcher.dispatch(room.id, userMessage);
    } catch (err) {
      console.error(`[Messages] Dispatch error for room ${room.id}:`, err);
    }
  });

  return router;
}
