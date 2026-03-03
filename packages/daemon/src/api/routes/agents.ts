import { Router } from 'express';
import type { AgentManager } from '../../core/agent-manager.js';
import { MemoryStore } from '../../agent/memory-store.js';
import type { ApiResponse } from '@merry/shared';

export function agentRoutes(agentManager: AgentManager, memoryStore: MemoryStore): Router {
  const router = Router();

  // GET /api/agents
  router.get('/', (_req, res) => {
    const states = agentManager.getAllStates();
    res.json({ ok: true, data: states } satisfies ApiResponse);
  });

  // GET /api/agents/:id
  router.get('/:id', (req, res) => {
    const agent = agentManager.get(req.params.id);
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Agent not found' } satisfies ApiResponse);
      return;
    }
    res.json({
      ok: true,
      data: {
        id: agent.id,
        definition: agent.definition,
        status: agent.status,
        sessionId: null,
        currentRoomId: agent.currentRoomId,
        totalTokensUsed: agent.totalTokensUsed,
        totalCostUsd: agent.totalCostUsd,
        lastActiveAt: agent.lastActiveAt,
      },
    } satisfies ApiResponse);
  });

  // POST /api/agents/:id/reload
  router.post('/:id/reload', (req, res) => {
    try {
      const def = agentManager.reload(req.params.id);
      res.json({ ok: true, data: def } satisfies ApiResponse);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) } satisfies ApiResponse);
    }
  });

  // POST /api/agents/:id/stop
  router.post('/:id/stop', (req, res) => {
    agentManager.stop(req.params.id);
    res.json({ ok: true } satisfies ApiResponse);
  });

  // GET /api/agents/:id/memory
  router.get('/:id/memory', (req, res) => {
    const context = memoryStore.getMemoryContext(req.params.id);
    const facts = memoryStore.getFacts(req.params.id);
    const preferences = memoryStore.getPreferences(req.params.id);
    res.json({ ok: true, data: { context, facts, preferences } } satisfies ApiResponse);
  });

  return router;
}
