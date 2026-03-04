import { Router } from 'express';
import type { MessageRouter } from '../../core/message-router.js';
import type { RoomManager } from '../../core/room-manager.js';
import type { AgentManager } from '../../core/agent-manager.js';
import type { DiscussionEngine } from '../../core/discussion-engine.js';
import { SSEManager } from '../sse/sse-manager.js';
import type { ApiResponse, SendMessageRequest } from '@merry/shared';

export function messageRoutes(
  messageRouter: MessageRouter,
  roomManager: RoomManager,
  agentManager: AgentManager,
  discussionEngine: DiscussionEngine,
  sse: SSEManager,
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

    // If discussion is running, the engine will pick up the user message
    const state = discussionEngine.getState(room.id);
    if (state.status === 'running') {
      res.json({ ok: true, data: userMessage } satisfies ApiResponse);
      return;
    }

    // If no discussion is running, get a single agent response
    // Use specified agent or first member
    const targetAgentId = body.agentId ?? room.members[0];
    if (!targetAgentId) {
      res.json({ ok: true, data: userMessage } satisfies ApiResponse);
      return;
    }

    const agent = agentManager.get(targetAgentId);
    if (!agent) {
      res.json({ ok: true, data: userMessage } satisfies ApiResponse);
      return;
    }

    // Build agent name map
    const agentNames = new Map<string, string>();
    for (const memberId of room.members) {
      const a = agentManager.get(memberId);
      if (a) agentNames.set(memberId, a.definition.name);
    }

    const recentMessages = messageRouter.getMessages(room.id, 20);
    const messageId = messageRouter.createStreamingPlaceholder(room.id, targetAgentId);

    // Forward stream/status/tool events to SSE
    const onStream = (chunk: any) => sse.broadcast({ type: 'message:stream', data: chunk });
    const onStatus = (s: any) => sse.broadcast({ type: 'agent:status', data: s });
    const onToolUse = (t: any) => sse.broadcast({ type: 'tool:start', data: t });
    const onToolComplete = (t: any) => sse.broadcast({ type: 'tool:complete', data: t });
    agent.on('stream', onStream);
    agent.on('status', onStatus);
    agent.on('tool_use', onToolUse);
    agent.on('tool_complete', onToolComplete);

    // Send response immediately, agent will respond asynchronously
    res.json({ ok: true, data: userMessage } satisfies ApiResponse);

    try {
      const result = await agent.executeTurn({
        roomId: room.id,
        messageId,
        prompt: body.content,
        recentMessages,
        agentNames,
        roomContext: { name: room.name, members: room.members.map(m => agentNames.get(m) ?? m) },
      });

      messageRouter.createMessage({
        roomId: room.id,
        role: 'agent',
        agentId: targetAgentId,
        content: result.content,
        metadata: {
          toolUseBlocks: result.toolUseBlocks.length > 0 ? result.toolUseBlocks : undefined,
          sdkSessionId: result.sdkSessionId,
          numTurns: result.numTurns,
          durationMs: result.durationMs,
        },
      });
    } catch (err) {
      console.error(`[Messages] Agent response error:`, err);
    } finally {
      agent.off('stream', onStream);
      agent.off('status', onStatus);
      agent.off('tool_use', onToolUse);
      agent.off('tool_complete', onToolComplete);
    }
  });

  return router;
}
