import { Router } from 'express';
import type { ProcessManager } from '../../process/process-manager.js';
import type { AgentManager } from '../../core/agent-manager.js';
import type { RoomManager } from '../../core/room-manager.js';
import type { ApiResponse } from '@merry/shared';

export function instanceRoutes(
  processManager: ProcessManager,
  agentManager: AgentManager,
  roomManager: RoomManager,
): Router {
  const router = Router();

  // POST /api/rooms/:id/agents/:agentId/start
  router.post('/:id/agents/:agentId/start', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }

    const agent = agentManager.get(req.params.agentId);
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Agent not found' } satisfies ApiResponse);
      return;
    }

    try {
      const agentNames = new Map<string, string>();
      for (const memberId of room.members) {
        const a = agentManager.get(memberId);
        if (a) agentNames.set(memberId, a.definition.name);
      }

      const info = await processManager.startAgent(
        agent.definition,
        room.id,
        { name: room.name, members: room.members.map(m => agentNames.get(m) ?? m) },
      );
      res.json({ ok: true, data: info } satisfies ApiResponse);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) } satisfies ApiResponse);
    }
  });

  // POST /api/rooms/:id/agents/:agentId/stop
  router.post('/:id/agents/:agentId/stop', async (req, res) => {
    try {
      await processManager.stopAgent(req.params.agentId, req.params.id);
      res.json({ ok: true } satisfies ApiResponse);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) } satisfies ApiResponse);
    }
  });

  // POST /api/rooms/:id/agents/start-all
  router.post('/:id/agents/start-all', async (req, res) => {
    const room = roomManager.get(req.params.id);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Room not found' } satisfies ApiResponse);
      return;
    }

    const agentNames = new Map<string, string>();
    for (const memberId of room.members) {
      const a = agentManager.get(memberId);
      if (a) agentNames.set(memberId, a.definition.name);
    }

    const results = [];
    for (const memberId of room.members) {
      const agent = agentManager.get(memberId);
      if (!agent) continue;
      try {
        const info = await processManager.startAgent(
          agent.definition,
          room.id,
          { name: room.name, members: room.members.map(m => agentNames.get(m) ?? m) },
        );
        results.push(info);
      } catch (err) {
        console.error(`[Instances] Failed to start ${memberId}:`, err);
      }
    }
    res.json({ ok: true, data: results } satisfies ApiResponse);
  });

  // POST /api/rooms/:id/agents/stop-all
  router.post('/:id/agents/stop-all', async (req, res) => {
    const roomId = req.params.id;
    const agents = processManager.getRoomAgents(roomId);
    for (const agentId of agents) {
      try {
        await processManager.stopAgent(agentId, roomId);
      } catch (err) {
        console.error(`[Instances] Failed to stop ${agentId}:`, err);
      }
    }
    res.json({ ok: true } satisfies ApiResponse);
  });

  // GET /api/rooms/:id/agents/instances
  router.get('/:id/agents/instances', (req, res) => {
    const instances = processManager.getRoomInstances(req.params.id);
    res.json({ ok: true, data: instances } satisfies ApiResponse);
  });

  // GET /api/instances (global)
  router.get('/', (_req, res) => {
    const instances = processManager.getAllInstances();
    res.json({ ok: true, data: instances } satisfies ApiResponse);
  });

  return router;
}
