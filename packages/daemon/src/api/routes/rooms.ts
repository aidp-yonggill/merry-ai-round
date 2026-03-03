import { Router } from 'express';
import type { RoomManager } from '../../core/room-manager.js';
import type { ApiResponse, CreateRoomRequest } from '@merry/shared';

export function roomRoutes(roomManager: RoomManager): Router {
  const router = Router();

  // GET /api/rooms
  router.get('/', (_req, res) => {
    const rooms = roomManager.getAll();
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
