import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { AgentInstanceInfo, InstanceStatus, AgentDefinition } from '@merry/shared';
import { ClaudeProcess, type ClaudeProcessOptions, type ProcessResult } from './claude-process.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { MemoryCompactor } from '../memory/memory-compactor.js';
import type { MemorySynthesizer } from '../memory/memory-synthesizer.js';

interface ManagedInstance {
  instanceId: string;
  agentId: string;
  roomId: string;
  process: ClaudeProcess;
  status: InstanceStatus;
  spawnedAt: string;
  lastActiveAt: string | null;
  tokensUsed: number;
  costUsd: number;
  restartCount: number;
}

export interface ProcessManagerConfig {
  maxConcurrentProcesses: number;
  maxProcessesPerAgent: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
  maxRestarts: number;
  cliPath?: string;
}

const DEFAULT_CONFIG: ProcessManagerConfig = {
  maxConcurrentProcesses: 10,
  maxProcessesPerAgent: 5,
  idleTimeoutMs: 300_000, // 5 minutes
  healthCheckIntervalMs: 15_000, // 15 seconds
  maxRestarts: 3,
};

/**
 * Manages multiple ClaudeProcess instances keyed by agentId:roomId.
 * Handles spawning, stopping, health checks, and crash recovery.
 */
export class ProcessManager extends EventEmitter {
  private instances = new Map<string, ManagedInstance>();
  private config: ProcessManagerConfig;
  private memoryManager: MemoryManager;
  private compactor: MemoryCompactor;
  private synthesizer: MemorySynthesizer;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    memoryManager: MemoryManager,
    compactor: MemoryCompactor,
    synthesizer: MemorySynthesizer,
    config?: Partial<ProcessManagerConfig>,
  ) {
    super();
    this.memoryManager = memoryManager;
    this.compactor = compactor;
    this.synthesizer = synthesizer;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private key(agentId: string, roomId: string): string {
    return `${agentId}:${roomId}`;
  }

  /**
   * Start an agent in a room — spawns a new ClaudeProcess.
   */
  async startAgent(
    agent: AgentDefinition,
    roomId: string,
    roomContext: { name: string; members: string[] },
  ): Promise<AgentInstanceInfo> {
    const k = this.key(agent.id, roomId);

    // Check if already running
    const existing = this.instances.get(k);
    if (existing && (existing.status === 'running' || existing.status === 'spawning')) {
      return this.toInfo(existing);
    }

    // Check resource limits
    if (this.instances.size >= this.config.maxConcurrentProcesses) {
      throw new Error(`Max concurrent processes (${this.config.maxConcurrentProcesses}) reached`);
    }
    const agentCount = this.getAgentRooms(agent.id).length;
    if (agentCount >= this.config.maxProcessesPerAgent) {
      throw new Error(`Agent ${agent.id} already has ${agentCount} instances (max: ${this.config.maxProcessesPerAgent})`);
    }

    const instanceId = nanoid(12);
    const systemPrompt = this.memoryManager.buildSystemPrompt(agent, roomContext);

    const processOpts: ClaudeProcessOptions = {
      model: agent.model,
      systemPrompt,
      maxBudgetUsd: agent.maxBudgetUsd,
      allowedTools: agent.tools.allowed.length > 0 ? agent.tools.allowed : undefined,
      disallowedTools: agent.tools.disallowed.length > 0 ? agent.tools.disallowed : undefined,
      cliPath: this.config.cliPath,
    };

    const proc = new ClaudeProcess(processOpts);
    const instance: ManagedInstance = {
      instanceId,
      agentId: agent.id,
      roomId,
      process: proc,
      status: 'spawning',
      spawnedAt: new Date().toISOString(),
      lastActiveAt: null,
      tokensUsed: 0,
      costUsd: 0,
      restartCount: 0,
    };

    this.instances.set(k, instance);

    // Wire process events
    proc.on('stream', (chunk) => this.emit('stream', chunk));
    proc.on('tool_use', (data) => this.emit('tool_use', data));
    proc.on('tool_result', (data) => this.emit('tool_result', data));

    proc.on('exit', ({ code, signal }) => {
      const inst = this.instances.get(k);
      if (!inst) return;

      if (inst.status === 'stopping' || inst.status === 'stopped') {
        // Expected shutdown
        inst.status = 'stopped';
        this.emitInstanceEvent('instance:stopped', inst);
      } else {
        // Unexpected crash
        console.error(`[ProcessManager] Agent ${agent.id} in room ${roomId} crashed (code=${code}, signal=${signal})`);
        inst.status = 'crashed';
        this.emitInstanceEvent('instance:crashed', inst, `Exit code: ${code}, signal: ${signal}`);

        // Attempt restart
        if (inst.restartCount < this.config.maxRestarts) {
          inst.restartCount++;
          console.log(`[ProcessManager] Restarting ${agent.id}:${roomId} (attempt ${inst.restartCount}/${this.config.maxRestarts})`);
          setTimeout(() => {
            try {
              proc.spawn();
              inst.status = 'running';
              this.emitInstanceEvent('instance:running', inst);
            } catch (err) {
              console.error(`[ProcessManager] Restart failed for ${agent.id}:${roomId}:`, err);
            }
          }, 1000 * inst.restartCount);
        }
      }
    });

    proc.on('error', (err) => {
      console.error(`[ProcessManager] Process error for ${agent.id}:${roomId}:`, err);
    });

    // Spawn
    try {
      proc.spawn();
      instance.status = 'running';
      this.emitInstanceEvent('instance:running', instance);

      // Start health check timer if not running
      if (!this.healthCheckTimer) {
        this.startHealthChecks();
      }
    } catch (err) {
      instance.status = 'crashed';
      this.emitInstanceEvent('instance:crashed', instance, String(err));
      throw err;
    }

    return this.toInfo(instance);
  }

  /**
   * Stop an agent in a room — compact memory, then terminate process.
   */
  async stopAgent(agentId: string, roomId: string): Promise<void> {
    const k = this.key(agentId, roomId);
    const instance = this.instances.get(k);
    if (!instance) return;

    instance.status = 'stopping';

    // Compact short-term memory before stopping
    try {
      this.emit('memory:compaction', {
        agentId,
        roomId,
        phase: 'started',
      });

      await this.compactor.compact(agentId, roomId);

      this.emit('memory:compaction', {
        agentId,
        roomId,
        phase: 'compacting',
        message: 'Short-term memory compacted',
      });

      // Check if this is the last room for the agent — trigger synthesis
      const otherRooms = this.getAgentRooms(agentId).filter(r => r !== roomId);
      if (otherRooms.length === 0) {
        this.emit('memory:compaction', {
          agentId,
          phase: 'synthesizing',
          message: 'Synthesizing long-term memory',
        });
        await this.synthesizer.synthesize(agentId);
      }

      this.emit('memory:compaction', {
        agentId,
        roomId,
        phase: 'completed',
      });
    } catch (err) {
      console.error(`[ProcessManager] Memory compaction failed for ${agentId}:${roomId}:`, err);
      this.emit('memory:compaction', {
        agentId,
        roomId,
        phase: 'failed',
        message: String(err),
      });
    }

    // Terminate process
    await instance.process.terminate();
    instance.status = 'stopped';
    this.emitInstanceEvent('instance:stopped', instance);
    this.instances.delete(k);

    // Stop health checks if no instances remain
    if (this.instances.size === 0 && this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Send a message to an agent in a room.
   */
  async sendToAgent(
    agentId: string,
    roomId: string,
    content: string,
    messageId: string,
  ): Promise<ProcessResult> {
    const k = this.key(agentId, roomId);
    const instance = this.instances.get(k);
    if (!instance || instance.status !== 'running') {
      throw new Error(`Agent ${agentId} is not running in room ${roomId}`);
    }

    instance.lastActiveAt = new Date().toISOString();

    const result = await instance.process.sendMessage(content, {
      agentId,
      roomId,
      messageId,
    });

    // Update tracking
    instance.tokensUsed += (result.tokensIn ?? 0) + (result.tokensOut ?? 0);
    instance.costUsd += result.costUsd ?? 0;
    instance.lastActiveAt = new Date().toISOString();

    // Emit resource update
    this.emit('instance:resource', {
      instanceId: instance.instanceId,
      agentId,
      roomId,
      tokensUsed: instance.tokensUsed,
      costUsd: instance.costUsd,
    });

    return result;
  }

  /**
   * Get the process for an agent in a room.
   */
  getProcess(agentId: string, roomId: string): ClaudeProcess | null {
    const instance = this.instances.get(this.key(agentId, roomId));
    return instance?.process ?? null;
  }

  /**
   * Get instance info for an agent in a room.
   */
  getInstance(agentId: string, roomId: string): AgentInstanceInfo | null {
    const instance = this.instances.get(this.key(agentId, roomId));
    return instance ? this.toInfo(instance) : null;
  }

  /**
   * Get all active agent instance IDs in a room.
   */
  getRoomAgents(roomId: string): string[] {
    const agents: string[] = [];
    for (const inst of this.instances.values()) {
      if (inst.roomId === roomId && (inst.status === 'running' || inst.status === 'idle')) {
        agents.push(inst.agentId);
      }
    }
    return agents;
  }

  /**
   * Get all rooms where an agent is active.
   */
  getAgentRooms(agentId: string): string[] {
    const rooms: string[] = [];
    for (const inst of this.instances.values()) {
      if (inst.agentId === agentId && (inst.status === 'running' || inst.status === 'idle')) {
        rooms.push(inst.roomId);
      }
    }
    return rooms;
  }

  /**
   * Get all active instances.
   */
  getAllInstances(): AgentInstanceInfo[] {
    return Array.from(this.instances.values()).map(i => this.toInfo(i));
  }

  /**
   * Get instances for a specific room.
   */
  getRoomInstances(roomId: string): AgentInstanceInfo[] {
    return Array.from(this.instances.values())
      .filter(i => i.roomId === roomId)
      .map(i => this.toInfo(i));
  }

  /**
   * Shut down all instances. Call on daemon exit.
   */
  async shutdownAll(): Promise<void> {
    console.log(`[ProcessManager] Shutting down ${this.instances.size} instances...`);

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    const stopPromises = Array.from(this.instances.entries()).map(async ([k, inst]) => {
      try {
        inst.status = 'stopping';
        await inst.process.terminate(3000);
      } catch (err) {
        console.error(`[ProcessManager] Error stopping ${k}:`, err);
      }
    });

    await Promise.all(stopPromises);
    this.instances.clear();
    console.log('[ProcessManager] All instances shut down.');
  }

  // ─── Private ───────────────────────────────────────

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      for (const [k, inst] of this.instances) {
        if (!inst.process.isAlive() && inst.status === 'running') {
          console.warn(`[ProcessManager] Detected dead process: ${k}`);
          inst.status = 'crashed';
          this.emitInstanceEvent('instance:crashed', inst, 'Process found dead during health check');
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  private emitInstanceEvent(type: string, instance: ManagedInstance, error?: string): void {
    const info = this.toInfo(instance);
    if (error) {
      this.emit(type, { ...info, error });
    } else {
      this.emit(type, info);
    }
  }

  private toInfo(inst: ManagedInstance): AgentInstanceInfo {
    return {
      instanceId: inst.instanceId,
      agentId: inst.agentId,
      roomId: inst.roomId,
      status: inst.status,
      pid: inst.process.pid,
      spawnedAt: inst.spawnedAt,
      lastActiveAt: inst.lastActiveAt,
      tokensUsed: inst.tokensUsed,
      costUsd: inst.costUsd,
    };
  }
}
