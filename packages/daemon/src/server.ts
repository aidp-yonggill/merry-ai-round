import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { ApiResponse, SystemHealth, SystemConfig, CostSummary } from '@merry/shared';

import { AgentManager } from './core/agent-manager.js';
import { RoomManager } from './core/room-manager.js';
import { MessageRouter } from './core/message-router.js';
import { DiscussionEngine } from './core/discussion-engine.js';
import { MemoryStore } from './agent/memory-store.js';
import { SqliteStore } from './storage/sqlite-store.js';
import { SSEManager } from './api/sse/sse-manager.js';

import { agentRoutes } from './api/routes/agents.js';
import { roomRoutes } from './api/routes/rooms.js';
import { messageRoutes } from './api/routes/messages.js';
import { discussionRoutes } from './api/routes/discussion.js';

export interface DaemonConfig {
  port: number;
  agentsDir: string;
  dataDir: string;
  corsOrigins: (string | RegExp)[];
}

export function createServer(config: DaemonConfig): { app: express.Express; shutdown: () => void } {
  const app = express();
  const startTime = Date.now();

  // Middleware
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
  }));
  app.use(express.json());

  // Initialize stores and managers
  const store = new SqliteStore(config.dataDir);
  const memoryStore = new MemoryStore(config.dataDir);
  const sse = new SSEManager();
  const agentManager = new AgentManager(config.agentsDir);
  agentManager.setMemoryStore(memoryStore);
  agentManager.setSqliteStore(store);
  const roomManager = new RoomManager(store);
  const messageRouter = new MessageRouter(store, sse);
  const discussionEngine = new DiscussionEngine(agentManager, messageRouter, sse, store, memoryStore);

  // Load agents from disk
  agentManager.loadAll();

  // --- SSE Endpoint ---
  app.get('/api/events', (req, res) => {
    const clientId = nanoid(8);
    const roomId = req.query.roomId as string | undefined;
    sse.addClient(clientId, res, roomId);
  });

  // --- API Routes ---
  app.use('/api/agents', agentRoutes(agentManager, memoryStore));
  app.use('/api/rooms', roomRoutes(roomManager));

  // Message and discussion routes need room ID prefix
  const roomScopedRouter = express.Router();
  const msgRoutes = messageRoutes(messageRouter, roomManager, agentManager, discussionEngine, sse);
  const discRoutes = discussionRoutes(discussionEngine, roomManager);

  // Mount message routes: /api/rooms/:id/messages
  roomScopedRouter.use('/', msgRoutes);
  // Mount discussion routes: /api/rooms/:id/discussion/*
  roomScopedRouter.use('/', discRoutes);
  app.use('/api/rooms', roomScopedRouter);

  // --- System Endpoints ---
  app.get('/api/system/health', (_req, res) => {
    const agents = agentManager.getAll();
    const rooms = roomManager.getAll();
    const health: SystemHealth = {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      activeAgents: agents.filter(a => a.status !== 'idle' && a.status !== 'stopped').length,
      activeRooms: rooms.length,
      activeDiscussions: 0, // TODO: track from discussion engine
    };
    res.json({ ok: true, data: health } satisfies ApiResponse);
  });

  app.get('/api/system/config', (_req, res) => {
    const sysConfig: SystemConfig = {
      version: '0.1.0',
      agentsDir: path.resolve(config.agentsDir),
      dataDir: path.resolve(config.dataDir),
      port: config.port,
    };
    res.json({ ok: true, data: sysConfig } satisfies ApiResponse);
  });

  app.get('/api/system/costs', (_req, res) => {
    const costs: CostSummary = store.getCostSummary();
    res.json({ ok: true, data: costs } satisfies ApiResponse);
  });

  // Cleanup function
  const shutdown = () => {
    console.log('[Server] Shutting down...');
    sse.stop();
    store.close();
  };

  return { app, shutdown };
}
