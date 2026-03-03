import Anthropic from '@anthropic-ai/sdk';
import type { AgentDefinition, AgentState } from '@merry/shared';
import { AgentInstance } from '../agent/agent-instance.js';
import { AgentConfigLoader } from '../agent/agent-config-loader.js';

export class AgentManager {
  private instances: Map<string, AgentInstance> = new Map();
  private configLoader: AgentConfigLoader;
  private client: Anthropic;

  constructor(agentsDir: string) {
    this.configLoader = new AgentConfigLoader(agentsDir);
    this.client = new Anthropic();
  }

  loadAll(): void {
    const definitions = this.configLoader.loadAll();
    for (const def of definitions) {
      if (!this.instances.has(def.id)) {
        this.instances.set(def.id, new AgentInstance(def, this.client));
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
    this.instances.set(agentId, new AgentInstance(def, this.client));
    return def;
  }

  stop(agentId: string): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.stop();
    }
  }
}
