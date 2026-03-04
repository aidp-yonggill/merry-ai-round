import type { AgentDefinition, AgentState } from '@merry/shared';
import { AgentInstance } from '../agent/agent-instance.js';
import { AgentConfigLoader } from '../agent/agent-config-loader.js';
import type { MemoryStore } from '../agent/memory-store.js';
import type { SqliteStore } from '../storage/sqlite-store.js';

export class AgentManager {
  private instances: Map<string, AgentInstance> = new Map();
  private configLoader: AgentConfigLoader;
  private memoryStore: MemoryStore | null = null;
  private sqliteStore: SqliteStore | null = null;

  constructor(agentsDir: string) {
    this.configLoader = new AgentConfigLoader(agentsDir);
  }

  setMemoryStore(store: MemoryStore): void {
    this.memoryStore = store;
  }

  setSqliteStore(store: SqliteStore): void {
    this.sqliteStore = store;
  }

  loadAll(): void {
    const definitions = this.configLoader.loadAll();
    for (const def of definitions) {
      if (!this.instances.has(def.id)) {
        const instance = new AgentInstance(def, this.memoryStore ?? undefined);

        // Restore cumulative stats from SQLite
        if (this.sqliteStore) {
          const stats = this.sqliteStore.getAgentCumulativeStats(def.id);
          instance.totalTokensUsed = stats.totalTokens;
          instance.totalCostUsd = stats.totalCostUsd;
        }

        this.instances.set(def.id, instance);
      }
    }
    console.log(`[AgentManager] Loaded ${definitions.length} agents: ${definitions.map(d => d.id).join(', ')}`);
  }

  get(agentId: string): AgentInstance | undefined {
    return this.instances.get(agentId);
  }

  getAll(): AgentInstance[] {
    return Array.from(this.instances.values());
  }

  getAllDefinitions(): AgentDefinition[] {
    return this.getAll().map(a => a.definition);
  }

  getAllStates(): AgentState[] {
    return this.getAll().map(a => ({
      id: a.id,
      definition: a.definition,
      status: a.status,
      sessionId: null,
      currentRoomId: a.currentRoomId,
      totalTokensUsed: a.totalTokensUsed,
      totalCostUsd: a.totalCostUsd,
      lastActiveAt: a.lastActiveAt,
    }));
  }

  reload(agentId: string): AgentDefinition {
    const def = this.configLoader.reload(agentId);
    const existing = this.instances.get(agentId);
    if (existing) {
      existing.stop();
    }
    this.instances.set(agentId, new AgentInstance(def, this.memoryStore ?? undefined));
    return def;
  }

  stop(agentId: string): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.stop();
    }
  }
}
