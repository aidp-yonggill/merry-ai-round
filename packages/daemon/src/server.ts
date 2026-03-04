import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { ApiResponse, SystemHealth, SystemConfig, CostSummary } from '@merry/shared';

import { AgentManager } from './core/agent-manager.js';
import { RoomManager } from './core/room-manager.js';
import { MessageRouter } from './core/message-router.js';
import { MessageDispatcher } from './core/message-dispatcher.js';
import { ProcessManager } from './process/process-manager.js';
import { MemoryManager } from './memory/memory-manager.js';
import { MemoryCompactor } from './memory/memory-compactor.js';
import { MemorySynthesizer } from './memory/memory-synthesizer.js';
import { AgentConfigLoader } from './agent/agent-config-loader.js';
import { SqliteStore } from './storage/sqlite-store.js';
import { SSEManager } from './api/sse/sse-manager.js';

import { agentRoutes } from './api/routes/agents.js';
import { roomRoutes } from './api/routes/rooms.js';
import { messageRoutes } from './api/routes/messages.js';
import { instanceRoutes } from './api/routes/instances.js';

export interface DaemonConfig {
  port: number;
  agentsDir: string;
  dataDir: string;
  corsOrigins: (string | RegExp)[];
  apiKey?: string;
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

  // API Key authentication (skip if not configured)
  if (config.apiKey) {
    app.use((req, res, next) => {
      // Allow health check without auth
      if (req.path === '/api/system/health') return next();

      const key = req.headers['x-api-key'] as string | undefined
        ?? req.query.apiKey as string | undefined;
      if (key !== config.apiKey) {
        res.status(401).json({ ok: false, error: 'Invalid API key' } satisfies ApiResponse);
        return;
      }
      next();
    });
  }

  // Initialize stores
  const store = new SqliteStore(config.dataDir);
  const sse = new SSEManager();

  // Memory system
  const memoryManager = new MemoryManager(config.dataDir);
  const compactor = new MemoryCompactor(memoryManager, {
    cliPath: process.env.CLAUDE_CLI_PATH,
  });
  const synthesizer = new MemorySynthesizer(memoryManager, {
    cliPath: process.env.CLAUDE_CLI_PATH,
  });

  // Agent management
  const configLoader = new AgentConfigLoader(config.agentsDir);
  const agentManager = new AgentManager(config.agentsDir);
  agentManager.setSqliteStore(store);

  // Process management
  const processManager = new ProcessManager(memoryManager, compactor, synthesizer, {
    cliPath: process.env.CLAUDE_CLI_PATH,
  });

  // Room & message management
  const roomManager = new RoomManager(store);
  const messageRouter = new MessageRouter(store, sse);

  // Message dispatcher (replaces discussion engine)
  const dispatcher = new MessageDispatcher(
    processManager,
    agentManager,
    messageRouter,
    memoryManager,
    sse,
    store,
  );

  // Load agents from disk
  agentManager.loadAll();

  // --- SSE Endpoint ---
  app.get('/api/events', (req, res) => {
    const clientId = nanoid(8);
    const roomId = req.query.roomId as string | undefined;
    sse.addClient(clientId, res, roomId);
  });

  // --- API Routes ---
  app.use('/api/agents', agentRoutes(agentManager, memoryManager, configLoader));
  app.use('/api/rooms', roomRoutes(roomManager, processManager, sse));
  app.use('/api/instances', instanceRoutes(processManager, agentManager, roomManager));

  // Room-scoped routes
  const roomScopedRouter = express.Router();
  const msgRoutes = messageRoutes(messageRouter, roomManager, dispatcher);
  const instRoutes = instanceRoutes(processManager, agentManager, roomManager);

  roomScopedRouter.use('/', msgRoutes);
  roomScopedRouter.use('/', instRoutes);
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
      activeInstances: processManager.getAllInstances().length,
    };
    res.json({ ok: true, data: health } satisfies ApiResponse);
  });

  app.get('/api/system/config', (_req, res) => {
    const sysConfig: SystemConfig = {
      version: '0.2.0',
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
    processManager.shutdownAll().catch(console.error);
    sse.stop();
    store.close();
  };

  return { app, shutdown };
}
