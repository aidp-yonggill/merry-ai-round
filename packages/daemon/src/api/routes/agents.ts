import { Router } from 'express';
import type { AgentManager } from '../../core/agent-manager.js';
import type { MemoryManager } from '../../memory/memory-manager.js';
import type { AgentConfigLoader } from '../../agent/agent-config-loader.js';
import type { ApiResponse, CreateAgentRequest } from '@merry/shared';

export function agentRoutes(
  agentManager: AgentManager,
  memoryManager: MemoryManager,
  configLoader: AgentConfigLoader,
): Router {
  const router = Router();

  // POST /api/agents — create a new agent
  router.post('/', (req, res) => {
    const body = req.body as CreateAgentRequest;
    if (!body.id || !body.name) {
      res.status(400).json({ ok: false, error: 'id and name are required' } satisfies ApiResponse);
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(body.id)) {
      res.status(400).json({ ok: false, error: 'id must match /^[a-z0-9][a-z0-9-]*$/' } satisfies ApiResponse);
      return;
    }
    try {
      const { id, name, persona, ...rest } = body;
      const frontmatter: Record<string, unknown> = { name, ...rest };
      delete (frontmatter as Record<string, unknown>)['id'];
      const def = agentManager.createAgent(id, frontmatter, persona ?? '');
      res.status(201).json({ ok: true, data: def } satisfies ApiResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('already exists') ? 409 : 500;
      res.status(status).json({ ok: false, error: msg } satisfies ApiResponse);
    }
  });

  // DELETE /api/agents/:id — delete an agent
  router.delete('/:id', (req, res) => {
    const agent = agentManager.get(req.params.id);
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Agent not found' } satisfies ApiResponse);
      return;
    }
    try {
      agentManager.deleteAgent(req.params.id);
      res.json({ ok: true } satisfies ApiResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: msg } satisfies ApiResponse);
    }
  });

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
        id: agent.definition.id,
        definition: agent.definition,
        status: agent.status,
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

  // GET /api/agents/:id/config — raw .agent.md content
  router.get('/:id/config', (req, res) => {
    const raw = configLoader.getRawConfig(req.params.id);
    if (raw === null) {
      res.status(404).json({ ok: false, error: 'Agent config not found' } satisfies ApiResponse);
      return;
    }
    res.json({ ok: true, data: raw } satisfies ApiResponse);
  });

  // PUT /api/agents/:id/config — update .agent.md and reload
  router.put('/:id/config', (req, res) => {
    const { content } = req.body as { content?: string };
    if (!content) {
      res.status(400).json({ ok: false, error: 'content is required' } satisfies ApiResponse);
      return;
    }
    try {
      const def = configLoader.saveRawConfig(req.params.id, content);
      agentManager.reload(req.params.id);
      res.json({ ok: true, data: def } satisfies ApiResponse);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) } satisfies ApiResponse);
    }
  });

  // GET /api/agents/:id/rules
  router.get('/:id/rules', (req, res) => {
    const rules = memoryManager.getRules(req.params.id);
    res.json({ ok: true, data: rules ?? '' } satisfies ApiResponse);
  });

  // PUT /api/agents/:id/rules
  router.put('/:id/rules', (req, res) => {
    const { content } = req.body as { content?: string };
    if (content === undefined) {
      res.status(400).json({ ok: false, error: 'content is required' } satisfies ApiResponse);
      return;
    }
    memoryManager.saveRules(req.params.id, content);
    res.json({ ok: true } satisfies ApiResponse);
  });

  // GET /api/agents/:id/memory — full memory status
  router.get('/:id/memory', (req, res) => {
    const status = memoryManager.getMemoryStatus(req.params.id);
    res.json({ ok: true, data: status } satisfies ApiResponse);
  });

  // GET /api/agents/:id/memory/long-term
  router.get('/:id/memory/long-term', (req, res) => {
    const synthesis = memoryManager.getLongTermSynthesis(req.params.id);
    res.json({ ok: true, data: synthesis } satisfies ApiResponse);
  });

  // GET /api/agents/:id/memory/sessions
  router.get('/:id/memory/sessions', (req, res) => {
    const roomId = req.query.roomId as string | undefined;
    const sessions = memoryManager.getCompactedSessions(req.params.id, roomId);
    res.json({ ok: true, data: sessions } satisfies ApiResponse);
  });

  // DELETE /api/agents/:id/memory/short-term/:roomId
  router.delete('/:id/memory/short-term/:roomId', (req, res) => {
    memoryManager.clearShortTermMemory(req.params.id, req.params.roomId);
    res.json({ ok: true } satisfies ApiResponse);
  });

  // POST /api/agents/:id/memory/synthesize — force re-synthesis
  router.post('/:id/memory/synthesize', async (req, res) => {
    try {
      // Dynamic import to avoid circular dependency
      const { MemorySynthesizer } = await import('../../memory/memory-synthesizer.js');
      const synthesizer = new MemorySynthesizer(memoryManager);
      const result = await synthesizer.synthesize(req.params.id);
      res.json({ ok: true, data: result } satisfies ApiResponse);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) } satisfies ApiResponse);
    }
  });

  return router;
}
