import { Router } from 'express';
import type { DiscussionEngine } from '../../core/discussion-engine.js';
import type { RoomManager } from '../../core/room-manager.js';
import type { ApiResponse } from '@merry/shared';

export function discussionRoutes(
  discussionEngine: DiscussionEngine,
  roomManager: RoomManager,
): Router {
  const router = Router();

  // GET /api/rooms/:id/discussion
  router.get('/:id/discussion', (req, res) => {
    const state = discussionEngine.getState(req.params.id);
    res.json({ ok: true, data: state } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/discussion/start
  router.post('/:id/discussion/start', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    if (room.members.length === 0) {
      res.status(400).json({ ok: false, error: 'Room has no members' } satisfies ApiResponse);
      return;
    }

    const state = await discussionEngine.start(room);
    res.json({ ok: true, data: state } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/discussion/pause
  router.post('/:id/discussion/pause', (req, res) => {
    const state = discussionEngine.pause(req.params.id);
    if (!state) {
      res.status(400).json({ ok: false, error: 'Discussion not running' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: state } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/discussion/resume
  router.post('/:id/discussion/resume', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    const state = await discussionEngine.resume(room);
    if (!state) {
      res.status(400).json({ ok: false, error: 'Discussion not paused' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: state } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/discussion/stop
  router.post('/:id/discussion/stop', (req, res) => {
    const state = discussionEngine.stop(req.params.id);
    if (!state) {
      res.status(400).json({ ok: false, error: 'No active discussion' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: state } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/discussion/assign
  router.post('/:id/discussion/assign', (req, res) => {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ ok: false, error: 'agentId is required' } satisfies ApiResponse);
      return;
    }
    discussionEngine.assignNextSpeaker(req.params.id, agentId);
    res.json({ ok: true } satisfies ApiResponse);
  });

  return router;
}
