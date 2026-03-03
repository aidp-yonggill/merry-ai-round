import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { AgentDefinition } from '@merry/shared';

interface RawFrontmatter {
  name?: string;
  model?: string;
  avatar?: string;
  color?: string;
  tags?: string[];
  tools?: { allowed?: string[]; disallowed?: string[] };
  maxTurns?: number;
  maxBudgetUsd?: number;
  discussion?: {
    responseStyle?: string;
    initiatesTopics?: boolean;
    mentionsBias?: string[];
  };
  memory?: { retentionDays?: number; maxEntries?: number };
}

const DEFAULTS: Omit<AgentDefinition, 'id' | 'persona'> = {
  name: 'Unnamed Agent',
  model: 'sonnet',
  avatar: '🤖',
  color: '#6B7280',
  tags: [],
  tools: { allowed: ['Read', 'Grep', 'Glob', 'WebSearch'], disallowed: [] },
  maxTurns: 5,
  maxBudgetUsd: 0.50,
  discussion: { responseStyle: 'conversational', initiatesTopics: false, mentionsBias: [] },
  memory: { retentionDays: 30, maxEntries: 100 },
};

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

    return {
      id,
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
      discussion: {
        responseStyle: (data.discussion?.responseStyle as AgentDefinition['discussion']['responseStyle']) ?? DEFAULTS.discussion.responseStyle,
        initiatesTopics: data.discussion?.initiatesTopics ?? DEFAULTS.discussion.initiatesTopics,
        mentionsBias: data.discussion?.mentionsBias ?? DEFAULTS.discussion.mentionsBias,
      },
      memory: {
        retentionDays: data.memory?.retentionDays ?? DEFAULTS.memory.retentionDays,
        maxEntries: data.memory?.maxEntries ?? DEFAULTS.memory.maxEntries,
      },
      persona: content.trim(),
    };
  }

  reload(agentId: string): AgentDefinition {
    return this.loadOne(`${agentId}.agent.md`);
  }
}
