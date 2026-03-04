import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { AgentDefinition, AgentBehaviorConfig, ResponseTrigger } from '@merry/shared';

interface RawFrontmatter {
  name?: string;
  slug?: string;
  model?: string;
  avatar?: string;
  color?: string;
  tags?: string[];
  tools?: { allowed?: string[]; disallowed?: string[] };
  maxTurns?: number;
  maxBudgetUsd?: number;
  behavior?: {
    responseTrigger?: string;
    responseStyle?: string;
    autoGreet?: boolean;
    watchPatterns?: string[];
  };
  memory?: {
    retentionDays?: number;
    maxEntries?: number;
    compactionModel?: string;
    synthesisModel?: string;
  };
  skipPermissions?: boolean;
}

const DEFAULTS: Omit<AgentDefinition, 'id' | 'slug' | 'persona'> = {
  name: 'Unnamed Agent',
  model: 'sonnet',
  avatar: '🤖',
  color: '#6B7280',
  tags: [],
  tools: { allowed: ['Read', 'Grep', 'Glob', 'WebSearch'], disallowed: [] },
  maxTurns: 5,
  maxBudgetUsd: 0.50,
  behavior: {
    responseTrigger: 'tagged',
    responseStyle: 'conversational',
    autoGreet: false,
  },
  memory: { retentionDays: 30, maxEntries: 100 },
};

const VALID_TRIGGERS: ResponseTrigger[] = ['always', 'tagged', 'called_by_agent', 'manual'];
const VALID_STYLES: AgentBehaviorConfig['responseStyle'][] = ['structured', 'conversational', 'brief'];

export class AgentConfigLoader {
  private agentsDir: string;

  constructor(agentsDir: string) {
    this.agentsDir = agentsDir;
  }

  loadAll(): AgentDefinition[] {
    if (!fs.existsSync(this.agentsDir)) return [];

    const files = fs.readdirSync(this.agentsDir)
      .filter(f => f.endsWith('.agent.md'));

    return files.map(f => this.loadOne(f));
  }

  loadOne(filename: string): AgentDefinition {
    const filePath = path.join(this.agentsDir, filename);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw) as { data: RawFrontmatter; content: string };

    const id = filename.replace('.agent.md', '');
    const slug = data.slug ?? id.slice(0, 4); // default: first 4 chars of id

    const trigger = data.behavior?.responseTrigger as ResponseTrigger | undefined;
    const style = data.behavior?.responseStyle as AgentBehaviorConfig['responseStyle'] | undefined;

    return {
      id,
      slug,
      name: data.name ?? DEFAULTS.name,
      model: (data.model as AgentDefinition['model']) ?? DEFAULTS.model,
      avatar: data.avatar ?? DEFAULTS.avatar,
      color: data.color ?? DEFAULTS.color,
      tags: data.tags ?? DEFAULTS.tags,
      tools: {
        allowed: data.tools?.allowed ?? DEFAULTS.tools.allowed,
        disallowed: data.tools?.disallowed ?? DEFAULTS.tools.disallowed,
      },
      maxTurns: data.maxTurns ?? DEFAULTS.maxTurns,
      maxBudgetUsd: data.maxBudgetUsd ?? DEFAULTS.maxBudgetUsd,
      behavior: {
        responseTrigger: trigger && VALID_TRIGGERS.includes(trigger) ? trigger : DEFAULTS.behavior.responseTrigger,
        responseStyle: style && VALID_STYLES.includes(style) ? style : DEFAULTS.behavior.responseStyle,
        autoGreet: data.behavior?.autoGreet ?? DEFAULTS.behavior.autoGreet,
        watchPatterns: data.behavior?.watchPatterns,
      },
      memory: {
        retentionDays: data.memory?.retentionDays ?? DEFAULTS.memory.retentionDays,
        maxEntries: data.memory?.maxEntries ?? DEFAULTS.memory.maxEntries,
        compactionModel: (data.memory?.compactionModel as 'haiku' | 'sonnet') ?? undefined,
        synthesisModel: (data.memory?.synthesisModel as 'haiku' | 'sonnet') ?? undefined,
      },
      persona: content.trim(),
      skipPermissions: data.skipPermissions ?? true,
    };
  }

  /** Get the raw .agent.md file content */
  getRawConfig(agentId: string): string | null {
    const filePath = path.join(this.agentsDir, `${agentId}.agent.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /** Write raw .agent.md file content and reload */
  saveRawConfig(agentId: string, content: string): AgentDefinition {
    const filePath = path.join(this.agentsDir, `${agentId}.agent.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return this.loadOne(`${agentId}.agent.md`);
  }

  reload(agentId: string): AgentDefinition {
    return this.loadOne(`${agentId}.agent.md`);
  }
}
