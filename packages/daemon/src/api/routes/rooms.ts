import { Router } from 'express';
import type { RoomManager } from '../../core/room-manager.js';
import type { ProcessManager } from '../../process/process-manager.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type { ApiResponse, CreateRoomRequest } from '@merry/shared';

export function roomRoutes(
  roomManager: RoomManager,
  processManager: ProcessManager,
  sse: SSEManager,
): Router {
  const router = Router();

  // GET /api/rooms
  router.get('/', (req, res) => {
    const status = req.query.status as string | undefined;
    const rooms = status === 'archived'
      ? roomManager.getArchived()
      : roomManager.getAll();
    res.json({ ok: true, data: rooms } satisfies ApiResponse);
  });

  // POST /api/rooms
  router.post('/', (req, res) => {
    const body = req.body as CreateRoomRequest;
    if (!body.name || !body.type || !body.members) {
      res.status(400).json({ ok: false, error: 'name, type, and members are required' } satisfies ApiResponse);
      return;
    }
    const room = roomManager.create(body);
    res.status(201).json({ ok: true, data: room } satisfies ApiResponse);
  });

  // GET /api/rooms/:id
  router.get('/:id', (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: room } satisfies ApiResponse);
  });

  // PATCH /api/rooms/:id
  router.patch('/:id', (req, res) => {
    const room = roomManager.update(req.params.id, req.body);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: room } satisfies ApiResponse);
  });

  // DELETE /api/rooms/:id
  router.delete('/:id', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }

    // Stop all active agents in this room first
    const activeAgents = processManager.getRoomAgents(room.id);
    for (const agentId of activeAgents) {
      await processManager.stopAgent(agentId, room.id);
    }

    roomManager.delete(room.id);
    sse.broadcast({ type: 'room:deleted', data: { roomId: room.id } });
    res.json({ ok: true, data: null } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/archive
  router.post('/:id/archive', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    if (room.status === 'archived') {
      res.status(400).json({ ok: false, error: 'Room is already archived' } satisfies ApiResponse);
      return;
    }

    // Stop all active agents (triggers memory compaction + synthesis)
    const activeAgents = processManager.getRoomAgents(room.id);
    for (const agentId of activeAgents) {
      await processManager.stopAgent(agentId, room.id);
    }

    roomManager.archive(room.id);
    sse.broadcast({ type: 'room:archived', data: { roomId: room.id } });
    res.json({ ok: true, data: null } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/unarchive
  router.post('/:id/unarchive', (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    if (room.status !== 'archived') {
      res.status(400).json({ ok: false, error: 'Room is not archived' } satisfies ApiResponse);
      return;
    }

    roomManager.unarchive(room.id);
    sse.broadcast({ type: 'room:unarchived', data: { roomId: room.id } });
    res.json({ ok: true, data: null } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/members
  router.post('/:id/members', (req, res) => {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ ok: false, error: 'agentId is required' } satisfies ApiResponse);
      return;
    }
    const room = roomManager.addMember(req.params.id, agentId);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: room } satisfies ApiResponse);
  });

  // DELETE /api/rooms/:id/members/:mid
  router.delete('/:id/members/:mid', (req, res) => {
    const room = roomManager.removeMember(req.params.id, req.params.mid);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: room } satisfies ApiResponse);
  });

  return router;
}
