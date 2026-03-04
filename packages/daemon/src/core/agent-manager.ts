import type { AgentDefinition, AgentState } from '@merry/shared';
import { AgentConfigLoader } from '../agent/agent-config-loader.js';
import type { SqliteStore } from '../storage/sqlite-store.js';

export type AgentStatus = 'idle' | 'thinking' | 'responding' | 'error' | 'stopped';

interface ManagedAgent {
  definition: AgentDefinition;
  status: AgentStatus;
  currentRoomId: string | null;
  totalTokensUsed: number;
  totalCostUsd: number;
  lastActiveAt: string | null;
}

export class AgentManager {
  private agents = new Map<string, ManagedAgent>();
  private configLoader: AgentConfigLoader;
  private sqliteStore: SqliteStore | null = null;

  constructor(agentsDir: string) {
    this.configLoader = new AgentConfigLoader(agentsDir);
  }

  setSqliteStore(store: SqliteStore): void {
    this.sqliteStore = store;
  }

  loadAll(): void {
    const definitions = this.configLoader.loadAll();
    for (const def of definitions) {
      if (!this.agents.has(def.id)) {
        const agent: ManagedAgent = {
          definition: def,
          status: 'idle',
          currentRoomId: null,
          totalTokensUsed: 0,
          totalCostUsd: 0,
          lastActiveAt: null,
        };

        // Restore cumulative stats from SQLite
        if (this.sqliteStore) {
          const stats = this.sqliteStore.getAgentCumulativeStats(def.id);
          agent.totalTokensUsed = stats.totalTokens;
          agent.totalCostUsd = stats.totalCostUsd;
        }

        this.agents.set(def.id, agent);
      }
    }
    console.log(`[AgentManager] Loaded ${definitions.length} agents: ${definitions.map(d => d.id).join(', ')}`);
  }

  get(agentId: string): ManagedAgent | undefined {
    return this.agents.get(agentId);
  }

  getAll(): ManagedAgent[] {
    return Array.from(this.agents.values());
  }

  getAllDefinitions(): AgentDefinition[] {
    return this.getAll().map(a => a.definition);
  }

  getAllStates(): AgentState[] {
    return this.getAll().map(a => ({
      id: a.definition.id,
      definition: a.definition,
      status: a.status,
      currentRoomId: a.currentRoomId,
      totalTokensUsed: a.totalTokensUsed,
      totalCostUsd: a.totalCostUsd,
      lastActiveAt: a.lastActiveAt,
    }));
  }

  createAgent(id: string, frontmatter: Record<string, unknown>, persona: string): AgentDefinition {
    const def = this.configLoader.createAgent(id, frontmatter, persona);
    const agent: ManagedAgent = {
      definition: def,
      status: 'idle',
      currentRoomId: null,
      totalTokensUsed: 0,
      totalCostUsd: 0,
      lastActiveAt: null,
    };
    this.agents.set(def.id, agent);
    return def;
  }

  deleteAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent && agent.currentRoomId !== null) {
      throw new Error(`Agent "${agentId}" is currently active in room ${agent.currentRoomId}`);
    }
    const deleted = this.configLoader.deleteAgent(agentId);
    if (deleted) {
      this.agents.delete(agentId);
    }
    return deleted;
  }

  reload(agentId: string): AgentDefinition {
    const def = this.configLoader.reload(agentId);
    const existing = this.agents.get(agentId);
    this.agents.set(agentId, {
      definition: def,
      status: 'idle',
      currentRoomId: null,
      totalTokensUsed: existing?.totalTokensUsed ?? 0,
      totalCostUsd: existing?.totalCostUsd ?? 0,
      lastActiveAt: existing?.lastActiveAt ?? null,
    });
    return def;
  }
}
